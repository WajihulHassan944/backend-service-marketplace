import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const SYSTEM_PROMPT = `You are an expert project scoping assistant for a services marketplace.
Given structured details from a buyer conversation and optional candidate suggestions, produce a concise JSON summary that helps match them with the right talent.
Always return valid JSON with the following fields:
- projectOverview: string
- keyNeeds: array of 3 short bullet strings highlighting the most important requirements.
- idealExpertProfile: string describing the type of talent that should respond.
- nextSteps: array of up to 3 actionable suggestions.
- tags: array of short lowercase tags (kebab-case) sized 3-6 items.
Ensure the JSON is minified (single line) and does not include markdown or code fences.`;

const CHAT_SYSTEM_PROMPT = `You are an AI guide helping buyers describe the work they need on a services marketplace.
Ask natural, conversational follow-up questions to pin down project scope, goals, timeline, budget, success criteria, and any must-have constraints.
Respond in JSON with fields: reply (string with the assistant message) and summaryReady (boolean). Set summaryReady to true only when the buyer has clearly provided enough detail for a project brief, or when the buyer explicitly asks for a summary. Keep replies friendly, concise, and reference the buyer's words. Never include markdown or code fences.`;

const safeParseJson = (raw, contextLabel = 'AI_RESPONSE') => {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();

  console.log(`[${contextLabel}] Raw model output:`, trimmed || '<empty>');

  try {
    const parsed = JSON.parse(trimmed);
    console.log(`[${contextLabel}] Parsed JSON successfully.`);
    return parsed;
  } catch (firstError) {
    console.warn(`[${contextLabel}] Primary JSON parse failed:`, firstError.message);
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.warn(`[${contextLabel}] Could not locate JSON object in response.`);
      return null;
    }

    const candidate = trimmed.slice(firstBrace, lastBrace + 1);

    try {
      const parsed = JSON.parse(candidate);
      console.log(`[${contextLabel}] Parsed JSON successfully after trimming extraneous text.`);
      return parsed;
    } catch (secondError) {
      console.warn(`[${contextLabel}] Secondary JSON parse failed:`, secondError.message);
      return null;
    }
  }
};

const buildPrompt = ({ searchTerm, answers = {}, conversation = [], suggestions = [] }) => {
  const payload = {
    searchTerm,
    answers,
    conversation,
    suggestions: suggestions.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      price: item.price,
      seller: item.seller,
    })),
  };

  return `BUYER INPUT:\n${JSON.stringify(payload, null, 2)}\n\nRespond with JSON:`;
};

const formatHistory = (history = []) => {
  if (!Array.isArray(history)) return '';

  return history
    .map((message) => {
      if (!message || typeof message !== 'object') return '';
      const role = message.role === 'user' ? 'Buyer' : 'Assistant';
      return `${role}: ${message.content || ''}`;
    })
    .filter(Boolean)
    .join('\n');
};

const buildChatPrompt = ({ searchTerm, history = [] }) => {
  const historyBlock = formatHistory(history);

  return [
    searchTerm ? `Search term: ${searchTerm}` : null,
    'Conversation so far:',
    historyBlock || 'None yet.',
    '',
    'Respond with JSON:'.trim(),
  ]
    .filter(Boolean)
    .join('\n');
};

export const generateBrief = async (req, res) => {
  try {
    const {
      searchTerm = '',
      answers = {},
      conversation = [],
      suggestions = [],
    } = req.body || {};

    const hasAnswers = Object.keys(answers || {}).length > 0;
    const hasConversation = Array.isArray(conversation) && conversation.length > 0;

    console.log('[AI_BRIEF] Incoming request body:', {
      searchTerm,
      answers,
      conversation,
      suggestions,
    });

    if (!searchTerm && !hasAnswers && !hasConversation) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least a search term or conversation history for context.',
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Missing OpenAI API key. Set OPENAI_API_KEY in your environment.',
      });
    }

    console.log('[AI_BRIEF] Sending prompt to model...');

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: SYSTEM_PROMPT,
      prompt: buildPrompt({ searchTerm, answers, conversation, suggestions }),
      temperature: 0.6,
      maxOutputTokens: 600,
    });

    console.log('[AI_BRIEF] Model response received:', result);

    const parsed = safeParseJson(result.text, 'AI_BRIEF');

    if (!parsed) {
      return res.status(502).json({
        success: false,
        message: 'AI response was not valid JSON.',
        raw: result.text,
      });
    }

    console.log('[AI_BRIEF] Parsed payload:', parsed);

    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('[AI_BRIEF] Generation failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to generate AI brief at this time.',
    });
  }
};

export const chatTurn = async (req, res) => {
  try {
    const { searchTerm = '', history = [] } = req.body || {};

    console.log('[AI_CHAT] Incoming request body:', { searchTerm, history });

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Missing OpenAI API key. Set OPENAI_API_KEY in your environment.',
      });
    }

    const prompt = buildChatPrompt({ searchTerm, history });

    console.log('[AI_CHAT] Sending prompt to model...');

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: CHAT_SYSTEM_PROMPT,
      prompt,
      temperature: 0.7,
      maxOutputTokens: 400,
    });

    console.log('[AI_CHAT] Model response received:', result);

    const parsed = safeParseJson(result.text, 'AI_CHAT');

    if (!parsed) {
      return res.status(502).json({
        success: false,
        message: 'AI response was not valid JSON.',
        raw: result.text,
      });
    }

    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    const summaryReady = Boolean(parsed.summaryReady);

    console.log('[AI_CHAT] Parsed payload:', { reply, summaryReady });

    if (!reply) {
      return res.status(502).json({
        success: false,
        message: 'AI response did not include a reply.',
        raw: parsed,
      });
    }

    return res.json({
      success: true,
      data: {
        reply,
        summaryReady,
      },
    });
  } catch (error) {
    console.error('[AI_CHAT] Turn failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to continue the AI conversation at this time.',
    });
  }
};
