/**
 * Route table test: deleting crew, outposts and ships is DM-only. Creating,
 * editing and the crew status changes (mark dead / departed / move) stay open
 * to every campaign member.
 */

let mockAuth = { isSuperadmin: false, campaignRole: 'DM' };

jest.mock('../../../middleware/auth', () => {
  const mw = (req, res, next) => {
    req.user = { id: 1, role: 'Player', username: 'someone' };
    req.campaignId = 1;
    req.campaignRole = mockAuth.campaignRole;
    req.isSuperadmin = mockAuth.isSuperadmin;
    next();
  };
  mw.allowNoCampaign = mw;
  return mw;
});

const handler = (name) => (req, res) => res.status(200).json({ handler: name });

jest.mock('../../../controllers/crewController', () => ({
  createCrew: handler('createCrew'), getAllCrew: handler('getAllCrew'),
  getCrewByLocation: handler('getCrewByLocation'), getDeceasedCrew: handler('getDeceasedCrew'),
  updateCrew: handler('updateCrew'), markCrewDead: handler('markCrewDead'),
  markCrewDeparted: handler('markCrewDeparted'), moveCrewToLocation: handler('moveCrewToLocation'),
  deleteCrew: handler('deleteCrew'),
}));
jest.mock('../../../controllers/outpostController', () => ({
  createOutpost: handler('createOutpost'), getAllOutposts: handler('getAllOutposts'),
  updateOutpost: handler('updateOutpost'), deleteOutpost: handler('deleteOutpost'),
}));
jest.mock('../../../controllers/shipController', () => ({
  getShipTypes: handler('getShipTypes'), getShipTypeData: handler('getShipTypeData'),
  createShip: handler('createShip'), getAllShips: handler('getAllShips'),
  updateShip: handler('updateShip'), deleteShip: handler('deleteShip'),
  applyDamage: handler('applyDamage'), repairShip: handler('repairShip'),
}));
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const express = require('express');
const request = require('supertest');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/crew', require('../crew'));
  app.use('/api/outposts', require('../outposts'));
  app.use('/api/ships', require('../ships'));
  return app;
};

const DELETES = [
  ['/api/crew/5', 'deleteCrew'],
  ['/api/outposts/5', 'deleteOutpost'],
  ['/api/ships/5', 'deleteShip'],
];

describe.each(DELETES)('DELETE %s', (url, handlerName) => {
  it('rejects a player with 403 without reaching the controller', async () => {
    mockAuth = { isSuperadmin: false, campaignRole: 'Player' };
    const res = await request(buildApp()).delete(url);
    expect(res.status).toBe(403);
    expect(res.body.handler).toBeUndefined();
  });

  it('lets a campaign DM through', async () => {
    mockAuth = { isSuperadmin: false, campaignRole: 'DM' };
    const res = await request(buildApp()).delete(url);
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe(handlerName);
  });

  it('lets the superadmin through', async () => {
    mockAuth = { isSuperadmin: true, campaignRole: undefined };
    const res = await request(buildApp()).delete(url);
    expect(res.status).toBe(200);
  });
});

describe('everything else stays open to a player', () => {
  beforeEach(() => { mockAuth = { isSuperadmin: false, campaignRole: 'Player' }; });

  it.each([
    ['post', '/api/crew', 'createCrew'],
    ['put', '/api/crew/5', 'updateCrew'],
    ['put', '/api/crew/5/mark-dead', 'markCrewDead'],
    ['put', '/api/crew/5/mark-departed', 'markCrewDeparted'],
    ['put', '/api/crew/5/move', 'moveCrewToLocation'],
    ['post', '/api/outposts', 'createOutpost'],
    ['put', '/api/outposts/5', 'updateOutpost'],
    ['post', '/api/ships', 'createShip'],
    ['put', '/api/ships/5', 'updateShip'],
    ['post', '/api/ships/5/damage', 'applyDamage'],
    ['post', '/api/ships/5/repair', 'repairShip'],
  ])('%s %s', async (method, url, handlerName) => {
    const res = await request(buildApp())[method](url).send({});
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe(handlerName);
  });
});
