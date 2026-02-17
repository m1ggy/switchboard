export type TapbackAction =
  | 'Liked'
  | 'Loved'
  | 'Disliked'
  | 'Laughed at'
  | 'Emphasized'
  | 'Questioned';

export type Tapback = {
  kind: 'tapback';
  action: TapbackAction;
  emoji: string;
  targetText: string;
};

const ACTION_TO_EMOJI: Record<TapbackAction, string> = {
  Liked: '👍',
  Loved: '❤️',
  Disliked: '👎',
  'Laughed at': '😂',
  Emphasized: '‼️',
  Questioned: '❓',
};

const TAPBACK_RE =
  /^(Liked|Loved|Disliked|Laughed at|Emphasized|Questioned)\s+[“"](.*)[”"]$/;

export function parseTapback(body?: string | null): Tapback | null {
  if (!body) return null;
  const trimmed = body.trim();
  const m = trimmed.match(TAPBACK_RE);
  if (!m) return null;

  const action = m[1] as TapbackAction;
  const targetText = m[2];

  return {
    kind: 'tapback',
    action,
    emoji: ACTION_TO_EMOJI[action],
    targetText,
  };
}
