/**
 * Tests for parseItemDescriptionWithGPT Service
 * Tests OpenAI integration for item description parsing
 */

const { parseItemDescriptionWithGPT } = require('../../../backend/src/services/parseItemDescriptionWithGPT');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const { OpenAI } = require('openai');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));
jest.mock('openai');

describe('parseItemDescriptionWithGPT Service', () => {
  let mockOpenAI;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };
    
    OpenAI.mockImplementation(() => mockOpenAI);

    // Default mock for OpenAI key retrieval
    dbUtils.executeQuery.mockResolvedValue({
      rows: [{
        value: 'test-openai-key',
        value_type: 'plain'
      }]
    });
  });

  describe('parseItemDescriptionWithGPT', () => {
    const mockGPTResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            mods: ['+1', 'Ghost Touch', 'Adamantine'],
            item: 'Rapier'
          })
        }
      }]
    };

    it('should parse item description successfully', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(mockGPTResponse);

      const result = await parseItemDescriptionWithGPT('+1 Ghost Touch Adamantine Rapier');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT value, value_type FROM settings WHERE name = $1',
        ['openai_key']
      );
      expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'test-openai-key' });
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('You are a helpful assistant that parses item descriptions')
          }),
          expect.objectContaining({
            role: 'user',
            content: 'Parse the following item description into its components (mods and item): "+1 Ghost Touch Adamantine Rapier".'
          })
        ]),
        temperature: 0.5,
        max_tokens: 64,
        top_p: 1
      });
      expect(result).toEqual({
        mods: ['+1', 'Ghost Touch', 'Adamantine'],
        item: 'Rapier'
      });
    });

    it('should handle complex weapon descriptions', async () => {
      const complexResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              mods: ['+4', 'Flaming Burst', 'Silver'],
              item: 'Lance'
            })
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(complexResponse);

      const result = await parseItemDescriptionWithGPT('+4 Flaming Burst Silver Lance');

      expect(result).toEqual({
        mods: ['+4', 'Flaming Burst', 'Silver'],
        item: 'Lance'
      });
    });

    it('should handle items with no mods', async () => {
      const simpleResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              mods: [],
              item: 'Longsword'
            })
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(simpleResponse);

      const result = await parseItemDescriptionWithGPT('Longsword');

      expect(result).toEqual({
        mods: [],
        item: 'Longsword'
      });
    });

    it('should handle encrypted OpenAI key', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          value: Buffer.from('encrypted-openai-key').toString('base64'),
          value_type: 'encrypted'
        }]
      });

      mockOpenAI.chat.completions.create.mockResolvedValue(mockGPTResponse);

      const result = await parseItemDescriptionWithGPT('+1 Rapier');

      expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'encrypted-openai-key' });
      expect(result).toEqual({
        mods: ['+1', 'Ghost Touch', 'Adamantine'],
        item: 'Rapier'
      });
    });

    it('should handle missing OpenAI key in settings', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await expect(parseItemDescriptionWithGPT('+1 Sword')).rejects.toThrow(
        'OpenAI API key not configured in settings'
      );

      expect(OpenAI).not.toHaveBeenCalled();
    });

    it('should handle null OpenAI key value', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          value: null,
          value_type: 'plain'
        }]
      });

      await expect(parseItemDescriptionWithGPT('+1 Sword')).rejects.toThrow(
        'OpenAI API key not configured in settings'
      );
    });

    it('should handle empty OpenAI key value', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          value: '',
          value_type: 'plain'
        }]
      });

      await expect(parseItemDescriptionWithGPT('+1 Sword')).rejects.toThrow(
        'OpenAI API key not configured in settings'
      );
    });

    it('should handle database errors when retrieving key', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(parseItemDescriptionWithGPT('+1 Sword')).rejects.toThrow('Database connection failed');
    });

    it('should handle OpenAI API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI API error'));

      await expect(parseItemDescriptionWithGPT('+1 Sword')).rejects.toThrow('OpenAI API error');
    });

    it('should handle malformed JSON response from GPT', async () => {
      const malformedResponse = {
        choices: [{
          message: {
            content: 'This is not valid JSON'
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(malformedResponse);

      await expect(parseItemDescriptionWithGPT('+1 Sword')).rejects.toThrow();
    });

    it('should handle empty response from GPT', async () => {
      const emptyResponse = {
        choices: [{
          message: {
            content: ''
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(emptyResponse);

      await expect(parseItemDescriptionWithGPT('+1 Sword')).rejects.toThrow();
    });

    it('should handle GPT response with extra whitespace', async () => {
      const responseWithWhitespace = {
        choices: [{
          message: {
            content: '   \n  ' + JSON.stringify({
              mods: ['+1'],
              item: 'Sword'
            }) + '  \n  '
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(responseWithWhitespace);

      const result = await parseItemDescriptionWithGPT('+1 Sword');

      expect(result).toEqual({
        mods: ['+1'],
        item: 'Sword'
      });
    });

    it('should handle very long item descriptions', async () => {
      const longDescription = '+5 Vicious Keen Flaming Burst Frost Shock Thundering Adamantine Mithril Cold Iron Silver Alchemical Gold Dragonhide Masterwork Longsword of Ultimate Power';
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockGPTResponse);

      await parseItemDescriptionWithGPT(longDescription);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining(longDescription)
            })
          ])
        })
      );
    });

    it('should use correct GPT model and parameters', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(mockGPTResponse);

      await parseItemDescriptionWithGPT('+1 Sword');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
          temperature: 0.5,
          max_tokens: 64,
          top_p: 1
        })
      );
    });

    it('should include proper system prompt with examples', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(mockGPTResponse);

      await parseItemDescriptionWithGPT('+1 Sword');

      const systemMessage = mockOpenAI.chat.completions.create.mock.calls[0][0].messages[0];
      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toContain('Ghost Touch Adamantine Rapier');
      expect(systemMessage.content).toContain('Flaming Burst Silver Lance');
      expect(systemMessage.content).toContain('Vicious Mithril Quarterstaff');
    });

    it('should handle special characters in item descriptions', async () => {
      const specialCharsDescription = '+1 "Flame's Edge" Sword (Masterwork)';
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockGPTResponse);

      await parseItemDescriptionWithGPT(specialCharsDescription);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining(specialCharsDescription)
            })
          ])
        })
      );
    });

    it('should handle unicode characters in descriptions', async () => {
      const unicodeDescription = '+1 Épée de Flâmme';
      
      mockOpenAI.chat.completions.create.mockResolvedValue(mockGPTResponse);

      await parseItemDescriptionWithGPT(unicodeDescription);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining(unicodeDescription)
            })
          ])
        })
      );
    });

    it('should handle Rate limiting errors from OpenAI', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      
      mockOpenAI.chat.completions.create.mockRejectedValue(rateLimitError);

      await expect(parseItemDescriptionWithGPT('+1 Sword')).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle authentication errors from OpenAI', async () => {
      const authError = new Error('Invalid API key');
      authError.status = 401;
      
      mockOpenAI.chat.completions.create.mockRejectedValue(authError);

      await expect(parseItemDescriptionWithGPT('+1 Sword')).rejects.toThrow('Invalid API key');
    });

    it('should handle GPT response with nested JSON', async () => {
      const nestedResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              mods: ['+1', 'Ghost Touch'],
              item: 'Rapier',
              metadata: {
                confidence: 0.95,
                source: 'gpt-3.5-turbo'
              }
            })
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(nestedResponse);

      const result = await parseItemDescriptionWithGPT('+1 Ghost Touch Rapier');

      expect(result).toEqual({
        mods: ['+1', 'Ghost Touch'],
        item: 'Rapier',
        metadata: {
          confidence: 0.95,
          source: 'gpt-3.5-turbo'
        }
      });
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle concurrent parsing requests', async () => {
      const responses = [
        {
          choices: [{
            message: {
              content: JSON.stringify({ mods: ['+1'], item: 'Sword' })
            }
          }]
        },
        {
          choices: [{
            message: {
              content: JSON.stringify({ mods: ['+2'], item: 'Axe' })
            }
          }]
        }
      ];

      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1]);

      const [result1, result2] = await Promise.all([
        parseItemDescriptionWithGPT('+1 Sword'),
        parseItemDescriptionWithGPT('+2 Axe')
      ]);

      expect(result1.item).toBe('Sword');
      expect(result2.item).toBe('Axe');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    });

    it('should handle empty string description', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ mods: [], item: '' })
          }
        }]
      });

      const result = await parseItemDescriptionWithGPT('');

      expect(result).toEqual({ mods: [], item: '' });
    });

    it('should handle very large JSON responses within token limit', async () => {
      const largeResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              mods: Array.from({ length: 20 }, (_, i) => `Mod${i + 1}`),
              item: 'UltimateSword'
            })
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(largeResponse);

      const result = await parseItemDescriptionWithGPT('Complex Item');

      expect(result.mods).toHaveLength(20);
      expect(result.item).toBe('UltimateSword');
    });
  });
});