const PREFIX = 'worker';

export function randomSuffix(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

export function defaultNickname(): string {
  return `${PREFIX}${randomSuffix()}`;
}

/** 영문·한글·숫자만, 최대 8자 (초과 시 잘림) */
export function sanitizeNickname(raw: string): string {
  const trimmed = raw.replace(/[^\p{L}\p{N}]/gu, '');
  return trimmed.slice(0, 8);
}

/** 공란이거나 정리 후 빈 문자열이면 `worker`+난수 3자리 */
export function nicknameFromInput(raw: string): string {
  const s = sanitizeNickname(raw.trim());
  return s || defaultNickname();
}
