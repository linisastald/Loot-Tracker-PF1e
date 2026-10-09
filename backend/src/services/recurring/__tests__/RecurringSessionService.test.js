jest.mock('../../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('../../../utils/timezoneUtils', () => ({
  getCampaignTimezone: jest.fn(),
}));

jest.mock('../../sessionService', () => ({
  scheduleSessionEvents: jest.fn(),
}));

const service = require('../RecurringSessionService');
const dbUtils = require('../../../utils/dbUtils');
const timezoneUtils = require('../../../utils/timezoneUtils');
const sessionService = require('../../sessionService');

const NY = 'America/New_York';

describe('RecurringSessionService.calculateNextOccurrence', () => {
  it('keeps the wall-clock time across the spring DST change (weekly)', () => {
    // Sat 2026-03-07 19:00 EST = 00:00Z on the 8th (clocks go forward that night)
    const next = service.calculateNextOccurrence(new Date('2026-03-08T00:00:00Z'), 'weekly', 1, 6, NY);
    // Sat 2026-03-14 19:00 EDT = 23:00Z
    expect(next.toISOString()).toBe('2026-03-14T23:00:00.000Z');
  });

  it('adds 14 days for biweekly and interval weeks for custom', () => {
    const start = new Date('2026-06-10T22:00:00Z'); // Wed 18:00 EDT
    expect(service.calculateNextOccurrence(start, 'biweekly', 1, 3, NY).toISOString()).toBe('2026-06-24T22:00:00.000Z');
    expect(service.calculateNextOccurrence(start, 'custom', 3, 3, NY).toISOString()).toBe('2026-07-01T22:00:00.000Z');
  });

  // Regression (F-0733): local midnight was formatted as hour 24 and rolled the date forward.
  it('handles a session at local midnight without skipping a day', () => {
    const start = new Date('2026-06-10T04:00:00Z'); // Wed 2026-06-10 00:00 EDT
    const next = service.calculateNextOccurrence(start, 'weekly', 1, 3, NY);
    expect(next.toISOString()).toBe('2026-06-17T04:00:00.000Z'); // Wed 2026-06-17 00:00 EDT
  });

  // Regression (F-0734): Jan 31 -> Feb 28 -> Mar 28 drifted for ever.
  it('returns to the anchor day of month after a short month (monthly)', () => {
    const jan31 = new Date('2026-01-31T23:00:00Z'); // 18:00 EST
    const feb = service.calculateNextOccurrence(jan31, 'monthly', 1, 6, NY, 31);
    expect(feb.toISOString()).toBe('2026-02-28T23:00:00.000Z');
    const mar = service.calculateNextOccurrence(feb, 'monthly', 1, 6, NY, 31);
    expect(mar.toISOString()).toBe('2026-03-31T22:00:00.000Z'); // 18:00 EDT
  });

  it('rolls monthly over the year boundary', () => {
    const dec = new Date('2026-12-15T23:00:00Z');
    expect(service.calculateNextOccurrence(dec, 'monthly', 1, 2, NY, 15).toISOString()).toBe('2027-01-15T23:00:00.000Z');
  });

  it('uses the timezone it is given, not shared state', () => {
    const start = new Date('2026-06-10T10:00:00Z'); // Wed 19:00 JST
    const next = service.calculateNextOccurrence(start, 'weekly', 1, 3, 'Asia/Tokyo');
    expect(next.toISOString()).toBe('2026-06-17T10:00:00.000Z');
    expect(service._cachedTimezone).toBeUndefined();
  });

  it('throws on an unknown pattern', () => {
    expect(() => service.calculateNextOccurrence(new Date(), 'yearly', 1, 1, NY)).toThrow('Unknown recurring pattern: yearly');
  });
});

describe('RecurringSessionService.generateRecurringInstances', () => {
  let client;

  const template = (overrides = {}) => ({
    id: 10,
    title: 'Game Night',
    description: 'd',
    start_time: '2026-06-10T22:00:00Z', // Wed 18:00 EDT
    end_time: '2026-06-11T02:00:00Z',
    minimum_players: 3,
    maximum_players: 6,
    auto_announce_hours: 168,
    reminder_hours: 24,
    confirmation_hours: 48,
    created_by: 1,
    recurring_pattern: 'weekly',
    recurring_day_of_week: 3,
    recurring_interval: 1,
    recurring_end_date: null,
    recurring_end_count: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    timezoneUtils.getCampaignTimezone.mockResolvedValue(NY);
    let n = 100;
    client = { query: jest.fn(async (sql, params) => ({ rows: [{ id: n++, start_time: params[1] }] })) };
  });

  // Regression (F-0723): a session on the end date itself used to be dropped.
  it('includes a session that falls on the end date', async () => {
    const instances = await service.generateRecurringInstances(
      client, template({ recurring_end_date: new Date(2026, 5, 24) }) // DATE column: local midnight
    );

    expect(client.query.mock.calls.map(c => c[1][1])).toEqual([
      '2026-06-17T22:00:00.000Z',
      '2026-06-24T22:00:00.000Z',
    ]);
    expect(instances).toHaveLength(2);
  });

  it('accepts the end date as a plain date string', async () => {
    await service.generateRecurringInstances(client, template({ recurring_end_date: '2026-06-17' }));
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('counts the template as the first occurrence of recurring_end_count', async () => {
    const instances = await service.generateRecurringInstances(client, template({ recurring_end_count: 4 }));
    expect(instances).toHaveLength(3);
    const insert = client.query.mock.calls[0];
    expect(insert[1][0]).toMatch(/^Game Night - /);
    expect(insert[1][10]).toBe(10); // parent_recurring_id
    // end time keeps the template's duration (4 hours)
    expect(new Date(insert[1][2]) - new Date(insert[1][1])).toBe(4 * 3600 * 1000);
  });

  it('defaults to 52 occurrences when the template has no end', async () => {
    await service.generateRecurringInstances(client, template());
    expect(client.query).toHaveBeenCalledTimes(51);
  });

  // Regression (F-0722): an unbounded count used to mean unbounded INSERTs in one transaction.
  it('clamps recurring_end_count to 104 occurrences', async () => {
    await service.generateRecurringInstances(client, template({ recurring_end_count: 100000 }));
    expect(client.query).toHaveBeenCalledTimes(103);
  });

  // Regression (F-0725): the INSERT error used to be swallowed, so COMMIT silently rolled back.
  it('lets a failed instance INSERT propagate so the transaction rolls back', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      service.generateRecurringInstances(client, template({ recurring_end_count: 5 }))
    ).rejects.toThrow('insert failed');
  });

  // Regression (F-0720/F-0721): the timezone was cached on the shared singleton.
  it('computes each template with its own campaign timezone, even concurrently', async () => {
    timezoneUtils.getCampaignTimezone
      .mockResolvedValueOnce('Asia/Tokyo')
      .mockResolvedValueOnce(NY);
    const tokyoClient = { query: jest.fn(async (sql, params) => ({ rows: [{ start_time: params[1] }] })) };
    const nyClient = { query: jest.fn(async (sql, params) => ({ rows: [{ start_time: params[1] }] })) };
    const base = template({ recurring_end_count: 2 });

    await Promise.all([
      service.generateRecurringInstances(tokyoClient, base),
      service.generateRecurringInstances(nyClient, base),
    ]);

    // 22:00Z is Thu 07:00 in Tokyo, so the weekly Wednesday lands on Wed 24 June
    // 07:00 JST (23 June 22:00Z); New York keeps Wed 18:00 EDT.
    expect(nyClient.query.mock.calls[0][1][1]).toBe('2026-06-17T22:00:00.000Z');
    expect(tokyoClient.query.mock.calls[0][1][1]).toBe('2026-06-23T22:00:00.000Z');
  });

  it('monthly occurrences return to the template day of month', async () => {
    const instances = await service.generateRecurringInstances(client, template({
      recurring_pattern: 'monthly',
      start_time: '2026-01-31T23:00:00Z',
      end_time: '2026-02-01T03:00:00Z',
      recurring_end_count: 4,
    }));
    expect(instances.map(i => i.start_time)).toEqual([
      '2026-02-28T23:00:00.000Z',
      '2026-03-31T22:00:00.000Z',
      '2026-04-30T22:00:00.000Z',
    ]);
  });
});

describe('RecurringSessionService.createRecurringSession', () => {
  let client;

  const body = (overrides = {}) => ({
    title: 'Weekly',
    start_time: '2026-06-10T22:00:00Z',
    end_time: '2026-06-11T02:00:00Z',
    description: 'd',
    created_by: 5,
    recurring_pattern: 'weekly',
    recurring_day_of_week: 3,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    timezoneUtils.getCampaignTimezone.mockResolvedValue(NY);
    sessionService.scheduleSessionEvents.mockResolvedValue(undefined);
    client = {
      query: jest.fn(async (sql, params) => {
        if (/is_recurring/.test(sql)) {
          return { rows: [{ id: 1, title: params[0], start_time: params[1], end_time: params[2],
            description: params[3], minimum_players: params[4], maximum_players: params[5],
            auto_announce_hours: params[6], reminder_hours: params[7], confirmation_hours: params[8],
            created_by: params[9], recurring_pattern: params[10], recurring_day_of_week: params[11],
            recurring_interval: params[12], recurring_end_date: null, recurring_end_count: params[14] }] };
        }
        return { rows: [{ id: 2, start_time: params[1] }] };
      }),
    };
    dbUtils.executeTransaction.mockImplementation(async (fn) => fn(client));
  });

  const templateInsert = () => client.query.mock.calls.find(c => /is_recurring/.test(c[0]));

  it('applies the shared defaults to omitted settings', async () => {
    await service.createRecurringSession(body({ recurring_end_count: 2 }));

    const params = templateInsert()[1];
    expect(params.slice(4, 9)).toEqual([3, 6, 168, 24, 48]); // min, max, announce, reminder, confirmation
  });

  it('keeps an explicit 0 instead of replacing it with the default', async () => {
    await service.createRecurringSession(body({ reminder_hours: 0, recurring_end_count: 2 }));

    expect(templateInsert()[1][7]).toBe(0);
  });

  it('schedules events for every instance only after the transaction has committed', async () => {
    const order = [];
    dbUtils.executeTransaction.mockImplementation(async (fn) => {
      const result = await fn(client);
      order.push('commit');
      return result;
    });
    sessionService.scheduleSessionEvents.mockImplementation(async () => { order.push('schedule'); });

    const result = await service.createRecurringSession(body({ recurring_end_count: 3 }));

    expect(result.instances).toHaveLength(2);
    expect(order).toEqual(['commit', 'schedule', 'schedule']);
  });

  it('rejects an invalid pattern, day of week, custom interval and end count', async () => {
    await expect(service.createRecurringSession(body({ recurring_pattern: 'daily' }))).rejects.toThrow('Invalid recurring pattern');
    await expect(service.createRecurringSession(body({ recurring_day_of_week: 9 }))).rejects.toThrow('Invalid day of week');
    await expect(service.createRecurringSession(body({ recurring_pattern: 'custom', recurring_interval: 'x' }))).rejects.toThrow('Custom interval');
    await expect(service.createRecurringSession(body({ recurring_end_count: 100000 }))).rejects.toThrow('between 1 and 104');
    expect(sessionService.scheduleSessionEvents).not.toHaveBeenCalled();
  });
});
