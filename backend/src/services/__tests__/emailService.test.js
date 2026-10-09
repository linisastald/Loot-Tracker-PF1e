// Unit tests for emailService: asserts the nodemailer transport options and
// the outgoing message shape. nodemailer is mocked; no network is used.
describe('emailService', () => {
  const ENV_KEYS = [
    'EMAIL_SERVICE', 'EMAIL_USER', 'EMAIL_PASS',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS',
    'FRONTEND_URL'
  ];
  let savedEnv;
  let createTransport;
  let transporter;
  let executeQuery;

  const loadService = () => {
    jest.resetModules();
    jest.dontMock('../emailService');
    transporter = {
      verify: jest.fn(),
      sendMail: jest.fn().mockResolvedValue({ messageId: 'x' })
    };
    createTransport = jest.fn().mockReturnValue(transporter);
    executeQuery = jest.fn().mockResolvedValue({ rows: [] });
    jest.doMock('nodemailer', () => ({ createTransport }));
    jest.doMock('dotenv', () => ({ config: jest.fn() }));
    jest.doMock('../../utils/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
    }));
    jest.doMock('../../utils/dbUtils', () => ({ executeQuery }));
    return jest.requireActual('../emailService');
  };

  beforeEach(() => {
    savedEnv = {};
    ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  });

  afterEach(() => {
    ENV_KEYS.forEach((k) => {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    });
  });

  it('creates no transport when nothing is configured', async () => {
    const svc = loadService();
    expect(createTransport).not.toHaveBeenCalled();
    expect(await svc.sendPasswordResetEmail('a@b.c', 'u', 't')).toBe(false);
  });

  it('uses the gmail service options when EMAIL_SERVICE=gmail', () => {
    process.env.EMAIL_SERVICE = 'gmail';
    process.env.EMAIL_USER = 'me@gmail.com';
    process.env.EMAIL_PASS = 'apppass';
    loadService();
    expect(createTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'me@gmail.com', pass: 'apppass' }
    });
    expect(transporter.verify).toHaveBeenCalledTimes(1);
  });

  it('uses SMTP options with defaults (port 587, secure false)', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASS = 'p';
    loadService();
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' }
    });
  });

  it('honours SMTP_PORT and SMTP_SECURE=true', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_SECURE = 'true';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASS = 'p';
    loadService();
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      port: '465',
      secure: true
    }));
  });

  it('sends the reset mail with the expected envelope and link', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.FRONTEND_URL = 'https://loot.example.com';
    const svc = loadService();
    const ok = await svc.sendPasswordResetEmail('player@example.com', 'Bob', 'tok123');
    expect(ok).toBe(true);
    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('player@example.com');
    expect(mail.from).toBe('pathfinderloottracker@kempsonandko.com');
    expect(mail.subject).toMatch(/Password Reset/);
    expect(mail.html).toContain('https://loot.example.com/reset-password?token=tok123');
  });

  it('HTML-escapes the username so it cannot inject markup into the mail', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    const svc = loadService();
    await svc.sendPasswordResetEmail('a@b.c', '<a href="https://evil.example">click</a> & <script>x</script>', 'tok');
    const html = transporter.sendMail.mock.calls[0][0].html;
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Hello &lt;a href=&quot;https://evil.example&quot;&gt;click&lt;/a&gt; &amp; &lt;script&gt;x&lt;/script&gt;,');
  });

  it('returns false when sendMail rejects', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    const svc = loadService();
    transporter.sendMail.mockRejectedValue(new Error('boom'));
    expect(await svc.sendPasswordResetEmail('a@b.c', 'u', 't')).toBe(false);
  });
});
