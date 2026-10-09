const { detectHostIp } = require('../hostIp');

describe('detectHostIp', () => {
  it('returns the first address of the host.docker.internal lookup', () => {
    const exec = jest.fn().mockReturnValueOnce('172.17.0.1 host.docker.internal\n');
    expect(detectHostIp(exec)).toBe('172.17.0.1');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('falls back to hostname -i when the lookup prints nothing (the old pipeline never did)', () => {
    const exec = jest.fn()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('10.0.0.5 fe80::1\n');
    expect(detectHostIp(exec)).toBe('10.0.0.5');
    expect(exec).toHaveBeenNthCalledWith(2, 'hostname -i');
  });

  it('falls back to hostname -i when the lookup command throws', () => {
    const exec = jest.fn()
      .mockImplementationOnce(() => { throw new Error('no getent'); })
      .mockReturnValueOnce('10.0.0.5\n');
    expect(detectHostIp(exec)).toBe('10.0.0.5');
  });

  it('returns 127.0.0.1, never an empty string, when nothing resolves', () => {
    expect(detectHostIp(jest.fn().mockReturnValue(''))).toBe('127.0.0.1');
    expect(detectHostIp(jest.fn(() => { throw new Error('x'); }))).toBe('127.0.0.1');
  });
});
