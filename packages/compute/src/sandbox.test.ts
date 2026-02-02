import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  COMMAND_ALLOWLIST,
  isCommandAllowed,
  validateCommand,
  validateWorkingDir,
  createSandboxEnv,
  getSandboxConfig,
  SandboxError,
} from './sandbox.js';
import { ERROR_CODES } from '@mission-control/shared';

describe('COMMAND_ALLOWLIST', () => {
  it('should include essential development commands', () => {
    expect(COMMAND_ALLOWLIST).toContain('git');
    expect(COMMAND_ALLOWLIST).toContain('npm');
    expect(COMMAND_ALLOWLIST).toContain('pnpm');
    expect(COMMAND_ALLOWLIST).toContain('node');
    expect(COMMAND_ALLOWLIST).toContain('npx');
  });

  it('should include safe file operations', () => {
    expect(COMMAND_ALLOWLIST).toContain('ls');
    expect(COMMAND_ALLOWLIST).toContain('cat');
    expect(COMMAND_ALLOWLIST).toContain('head');
    expect(COMMAND_ALLOWLIST).toContain('tail');
    expect(COMMAND_ALLOWLIST).toContain('find');
    expect(COMMAND_ALLOWLIST).toContain('grep');
  });

  it('should include basic file manipulation', () => {
    expect(COMMAND_ALLOWLIST).toContain('mkdir');
    expect(COMMAND_ALLOWLIST).toContain('cp');
    expect(COMMAND_ALLOWLIST).toContain('mv');
    expect(COMMAND_ALLOWLIST).toContain('rm');
  });

  it('should include orchestration commands', () => {
    expect(COMMAND_ALLOWLIST).toContain('gh');
    expect(COMMAND_ALLOWLIST).toContain('ssh');
    expect(COMMAND_ALLOWLIST).toContain('curl');
  });

  it('should NOT include dangerous commands', () => {
    expect(COMMAND_ALLOWLIST).not.toContain('sudo');
    expect(COMMAND_ALLOWLIST).not.toContain('su');
    expect(COMMAND_ALLOWLIST).not.toContain('bash');
    expect(COMMAND_ALLOWLIST).not.toContain('sh');
    expect(COMMAND_ALLOWLIST).not.toContain('zsh');
    expect(COMMAND_ALLOWLIST).not.toContain('wget');
    expect(COMMAND_ALLOWLIST).not.toContain('nc');
    expect(COMMAND_ALLOWLIST).not.toContain('chmod');
    expect(COMMAND_ALLOWLIST).not.toContain('chown');
  });
});

describe('isCommandAllowed', () => {
  describe('allowed commands', () => {
    it('should allow commands in allowlist', () => {
      expect(isCommandAllowed('git')).toBe(true);
      expect(isCommandAllowed('npm')).toBe(true);
      expect(isCommandAllowed('ls')).toBe(true);
      expect(isCommandAllowed('node')).toBe(true);
    });

    it('should allow commands with arguments', () => {
      expect(isCommandAllowed('git status')).toBe(true);
      expect(isCommandAllowed('npm install express')).toBe(true);
      expect(isCommandAllowed('ls -la /tmp')).toBe(true);
      expect(isCommandAllowed('node script.js')).toBe(true);
    });

    it('should allow commands with complex arguments', () => {
      expect(isCommandAllowed('git commit -m "fix: update readme"')).toBe(true);
      expect(isCommandAllowed('grep -r "pattern" ./src')).toBe(true);
      expect(isCommandAllowed('find . -name "*.ts"')).toBe(true);
    });

    it('should allow commands with full path', () => {
      expect(isCommandAllowed('/usr/bin/git status')).toBe(true);
      expect(isCommandAllowed('/usr/local/bin/node script.js')).toBe(true);
      expect(isCommandAllowed('/bin/ls -la')).toBe(true);
    });
  });

  describe('disallowed commands', () => {
    it('should reject dangerous commands', () => {
      expect(isCommandAllowed('sudo rm -rf /')).toBe(false);
      expect(isCommandAllowed('bash -c "evil"')).toBe(false);
      expect(isCommandAllowed('sh script.sh')).toBe(false);
      expect(isCommandAllowed('zsh')).toBe(false);
    });

    it('should reject dangerous network commands', () => {
      // curl and ssh are now allowed for orchestration
      expect(isCommandAllowed('wget http://evil.com')).toBe(false);
      expect(isCommandAllowed('nc -l 8080')).toBe(false);
    });

    it('should allow orchestration commands', () => {
      expect(isCommandAllowed('gh pr list')).toBe(true);
      expect(isCommandAllowed('ssh user@host')).toBe(true);
      expect(isCommandAllowed('curl http://api.example.com')).toBe(true);
    });

    it('should reject permission commands', () => {
      expect(isCommandAllowed('chmod 777 file')).toBe(false);
      expect(isCommandAllowed('chown root file')).toBe(false);
    });

    it('should reject language interpreters (except node)', () => {
      expect(isCommandAllowed('python script.py')).toBe(false);
      expect(isCommandAllowed('perl script.pl')).toBe(false);
      expect(isCommandAllowed('ruby script.rb')).toBe(false);
    });

    it('should reject unknown commands', () => {
      expect(isCommandAllowed('malware')).toBe(false);
      expect(isCommandAllowed('unknown-command')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should reject empty command', () => {
      expect(isCommandAllowed('')).toBe(false);
    });

    it('should reject whitespace-only command', () => {
      expect(isCommandAllowed('   ')).toBe(false);
    });

    it('should handle commands with leading/trailing whitespace', () => {
      expect(isCommandAllowed('  git status  ')).toBe(true);
    });

    it('should extract base command from path', () => {
      expect(isCommandAllowed('/very/long/path/to/git')).toBe(true);
      expect(isCommandAllowed('/very/long/path/to/evil')).toBe(false);
    });
  });
});

describe('validateCommand', () => {
  it('should not throw for allowed commands', () => {
    expect(() => validateCommand('git status')).not.toThrow();
    expect(() => validateCommand('npm install')).not.toThrow();
    expect(() => validateCommand('ls -la')).not.toThrow();
  });

  it('should throw SandboxError for disallowed commands', () => {
    expect(() => validateCommand('sudo rm -rf /')).toThrow(SandboxError);
    expect(() => validateCommand('bash -c "evil"')).toThrow(SandboxError);
    expect(() => validateCommand('wget http://evil.com')).toThrow(SandboxError);
  });

  it('should throw with correct error code', () => {
    try {
      validateCommand('sudo ls');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SandboxError);
      expect((err as SandboxError).code).toBe(ERROR_CODES.COMMAND_NOT_ALLOWED);
    }
  });

  it('should include helpful error message', () => {
    try {
      validateCommand('wget http://evil.com');
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as SandboxError).message).toContain('wget');
      expect((err as SandboxError).message).toContain('not in the allowlist');
    }
  });
});

describe('validateWorkingDir', () => {
  const sandboxConfig = {
    enabled: true,
    workDir: '/tmp/sandbox',
  };

  it('should not throw for paths within sandbox', () => {
    expect(() =>
      validateWorkingDir('/tmp/sandbox/project', sandboxConfig)
    ).not.toThrow();
    expect(() =>
      validateWorkingDir('/tmp/sandbox/a/b/c', sandboxConfig)
    ).not.toThrow();
  });

  it('should not throw for exact sandbox path', () => {
    expect(() =>
      validateWorkingDir('/tmp/sandbox', sandboxConfig)
    ).not.toThrow();
  });

  it('should throw for paths outside sandbox', () => {
    expect(() =>
      validateWorkingDir('/tmp/other', sandboxConfig)
    ).toThrow(SandboxError);
    expect(() =>
      validateWorkingDir('/etc/passwd', sandboxConfig)
    ).toThrow(SandboxError);
    expect(() =>
      validateWorkingDir('/home/user', sandboxConfig)
    ).toThrow(SandboxError);
  });

  it('should throw with correct error code', () => {
    try {
      validateWorkingDir('/etc', sandboxConfig);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SandboxError);
      expect((err as SandboxError).code).toBe(ERROR_CODES.SANDBOX_VIOLATION);
    }
  });

  it('should detect path traversal attempts', () => {
    // This tests that resolved paths are used
    expect(() =>
      validateWorkingDir('/tmp/sandbox/../other', sandboxConfig)
    ).toThrow(SandboxError);
  });

  it('should not throw when sandbox is disabled', () => {
    const disabledConfig = { enabled: false, workDir: '/tmp/sandbox' };
    expect(() =>
      validateWorkingDir('/etc/passwd', disabledConfig)
    ).not.toThrow();
    expect(() =>
      validateWorkingDir('/anywhere', disabledConfig)
    ).not.toThrow();
  });

  it('should handle paths with similar prefixes', () => {
    // /tmp/sandbox-other is NOT inside /tmp/sandbox
    expect(() =>
      validateWorkingDir('/tmp/sandbox-other', sandboxConfig)
    ).toThrow(SandboxError);
  });
});

describe('createSandboxEnv', () => {
  it('should create environment with safe PATH', () => {
    const env = createSandboxEnv();
    expect(env['PATH']).toBeDefined();
    expect(env['PATH']).toContain('/usr/bin');
    expect(env['PATH']).toContain('/bin');
    expect(env['PATH']).not.toContain('/tmp');
  });

  it('should include basic environment variables', () => {
    const env = createSandboxEnv();
    expect(env['HOME']).toBeDefined();
    expect(env['USER']).toBeDefined();
    expect(env['SHELL']).toBe('/bin/sh');
    expect(env['LANG']).toBe('en_US.UTF-8');
  });

  it('should set NODE_ENV to production', () => {
    const env = createSandboxEnv();
    expect(env['NODE_ENV']).toBe('production');
  });

  it('should disable npm update notifier', () => {
    const env = createSandboxEnv();
    expect(env['NO_UPDATE_NOTIFIER']).toBe('1');
    expect(env['npm_config_update_notifier']).toBe('false');
  });

  it('should merge additional environment variables', () => {
    const env = createSandboxEnv({ CUSTOM_VAR: 'value', API_KEY: 'secret' });
    expect(env['CUSTOM_VAR']).toBe('value');
    expect(env['API_KEY']).toBe('secret');
  });

  it('should allow overriding default variables', () => {
    const env = createSandboxEnv({ NODE_ENV: 'test' });
    expect(env['NODE_ENV']).toBe('test');
  });

  it('should block dangerous environment variables', () => {
    const env = createSandboxEnv({
      LD_PRELOAD: '/evil/lib.so',
      LD_LIBRARY_PATH: '/evil/libs',
      DYLD_INSERT_LIBRARIES: '/evil/lib.dylib',
      DYLD_LIBRARY_PATH: '/evil/libs',
      SAFE_VAR: 'allowed',
    });
    expect(env['LD_PRELOAD']).toBeUndefined();
    expect(env['LD_LIBRARY_PATH']).toBeUndefined();
    expect(env['DYLD_INSERT_LIBRARIES']).toBeUndefined();
    expect(env['DYLD_LIBRARY_PATH']).toBeUndefined();
    expect(env['SAFE_VAR']).toBe('allowed');
  });
});

describe('getSandboxConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return default config when env vars not set', () => {
    const config = getSandboxConfig();
    expect(config.enabled).toBe(true);
    expect(config.workDir).toBe('/tmp/mission-control/sandbox');
  });

  it('should respect SANDBOX_ENABLED=false', () => {
    vi.stubEnv('SANDBOX_ENABLED', 'false');
    const config = getSandboxConfig();
    expect(config.enabled).toBe(false);
  });

  it('should respect SANDBOX_WORKDIR', () => {
    vi.stubEnv('SANDBOX_WORKDIR', '/custom/sandbox');
    const config = getSandboxConfig();
    expect(config.workDir).toBe('/custom/sandbox');
  });

  it('should keep sandbox enabled for any value other than "false"', () => {
    vi.stubEnv('SANDBOX_ENABLED', 'true');
    expect(getSandboxConfig().enabled).toBe(true);

    vi.stubEnv('SANDBOX_ENABLED', '1');
    expect(getSandboxConfig().enabled).toBe(true);

    vi.stubEnv('SANDBOX_ENABLED', 'yes');
    expect(getSandboxConfig().enabled).toBe(true);
  });
});

describe('SandboxError', () => {
  it('should have correct name', () => {
    const error = new SandboxError('test', 'CODE');
    expect(error.name).toBe('SandboxError');
  });

  it('should include message and code', () => {
    const error = new SandboxError('Something went wrong', 'SOME_CODE');
    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe('SOME_CODE');
  });

  it('should be instanceof Error', () => {
    const error = new SandboxError('test', 'CODE');
    expect(error).toBeInstanceOf(Error);
  });
});
