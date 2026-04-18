import { MAX_STREAMING_CONTENT_LENGTH, MAX_CARD_CONTENT_LENGTH } from '../constants.js';
import { splitLongContent as sharedSplitLongContent, truncateText, buildInputSummary } from '../shared/utils.js';
import { t, type Language } from '../i18n.js';
import { loadConfig } from '../config.js';

// Lazy-load config to avoid circular dependency
let _config: ReturnType<typeof loadConfig> | null = null;
function getLang(): Language {
  if (!_config) _config = loadConfig();
  return _config.language;
}

export type CardStatus = 'processing' | 'thinking' | 'streaming' | 'done' | 'error';

interface CardOptions {
  content: string;
  status: CardStatus;
  note?: string;
  thinking?: string;
}

const HEADER_TEMPLATES: Record<CardStatus, string> = {
  processing: 'blue',
  thinking: 'blue',
  streaming: 'blue',
  done: 'green',
  error: 'red',
};

function getHeaderTitles(): Record<CardStatus, string> {
  const locale = t(getLang());
  return {
    processing: locale.cardStatusProcessing,
    thinking: locale.cardStatusThinking,
    streaming: locale.cardStatusStreaming,
    done: locale.cardStatusDone,
    error: locale.cardStatusError,
  };
}

export function truncateForCard(text: string): string {
  return truncateText(text, MAX_CARD_CONTENT_LENGTH);
}

export function buildCardObject(options: CardOptions, messageId?: string): Record<string, unknown> {
  const { content, status, note } = options;

  const elements: unknown[] = [
    {
      tag: 'markdown',
      content: truncateForCard(content) || '...',
    },
  ];

  if (note) {
    elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: note }],
    });
  }

  // 在处理中、思考中和流式输出状态时添加停止按钮
  if ((status === 'processing' || status === 'thinking' || status === 'streaming') && messageId) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: t(getLang()).stopButton,
          },
          type: 'danger',
          value: { action: 'stop', message_id: messageId },
        },
      ],
    });
  }

  const headerTitles = getHeaderTitles();
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: HEADER_TEMPLATES[status],
      title: {
        tag: 'plain_text',
        content: headerTitles[status],
      },
    },
    elements,
  };
}

export function buildCard(options: CardOptions, messageId?: string): string {
  return JSON.stringify(buildCardObject(options, messageId));
}

export function splitLongContent(text: string, maxLen = MAX_CARD_CONTENT_LENGTH): string[] {
  return sharedSplitLongContent(text, maxLen);
}

export function buildPermissionCard(requestId: string, toolName: string, toolInput: Record<string, unknown>): string {
  const locale = t(getLang());
  const inputSummary = buildInputSummary(toolName, toolInput);

  const card = {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: 'orange',
      title: { tag: 'plain_text', content: `${locale.permissionCardTitle}${toolName}` },
    },
    elements: [
      { tag: 'markdown', content: truncateForCard(inputSummary) },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: locale.allowButton },
            type: 'primary',
            value: JSON.stringify({ action: 'allow', requestId }),
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: locale.denyButton },
            type: 'danger',
            value: JSON.stringify({ action: 'deny', requestId }),
          },
        ],
      },
      { tag: 'note', elements: [{ tag: 'plain_text', content: `ID: ${requestId}` }] },
    ],
  };
  return JSON.stringify(card);
}

export function buildPermissionResultCard(toolName: string, decision: 'allow' | 'deny'): string {
  const locale = t(getLang());
  const isAllowed = decision === 'allow';
  const card = {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: isAllowed ? 'green' : 'red',
      title: { tag: 'plain_text', content: `${locale.permissionCardTitle}${toolName} - ${isAllowed ? locale.permissionAllowedStatus : locale.permissionDeniedStatus}` },
    },
    elements: [
      { tag: 'markdown', content: isAllowed ? locale.permissionAllowedText : locale.permissionDeniedText },
    ],
  };
  return JSON.stringify(card);
}

// ─── CardKit JSON 2.0 ───

export function truncateForStreaming(text: string): string {
  return truncateText(text, MAX_STREAMING_CONTENT_LENGTH);
}

export function buildCardV2Object(options: CardOptions, cardId?: string): Record<string, unknown> {
  const { content, status, note, thinking } = options;

  const elements: unknown[] = [];

  // 完成状态下，如果有思考过程，添加折叠面板
  if (status === 'done' && thinking) {
    elements.push({
      tag: 'collapsible_panel',
      expanded: false,
      header: {
        title: { tag: 'markdown', content: '💭 **思考过程**' },
      },
      border: { color: 'grey' },
      elements: [{ tag: 'markdown', content: thinking }],
    });
  }

  elements.push({
    tag: 'markdown',
    content: truncateForStreaming(content) || '...',
    element_id: 'main_content',
  });

  elements.push({
    tag: 'markdown',
    content: note || '',
    text_size: 'notation',
    element_id: 'note_area',
  });

  // 在处理中、思考中和流式输出状态时添加停止按钮
  if ((status === 'processing' || status === 'thinking' || status === 'streaming') && cardId) {
    elements.push({
      tag: 'button',
      text: { tag: 'plain_text', content: t(getLang()).stopButton },
      type: 'danger',
      value: { action: 'stop', card_id: cardId },
      element_id: 'action_stop',
    });
  }

  const isActive = status === 'processing' || status === 'thinking' || status === 'streaming';
  const headerTitles = getHeaderTitles();

  return {
    schema: '2.0',
    config: {
      update_multi: true,
      ...(isActive ? { streaming_mode: true } : {}),
    },
    header: {
      template: HEADER_TEMPLATES[status],
      title: { tag: 'plain_text', content: headerTitles[status] },
    },
    body: {
      direction: 'vertical',
      elements,
    },
  };
}

export function buildCardV2(options: CardOptions, cardId?: string): string {
  return JSON.stringify(buildCardV2Object(options, cardId));
}
