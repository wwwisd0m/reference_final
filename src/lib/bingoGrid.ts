/** 빙고 단어 풀 (25개씩) — bingoEngine / API match-room.ts 와 동기화 */

export const BINGO_FRUIT_WORDS: string[] = [
  '사과',
  '바나나',
  '오렌지',
  '귤',
  '딸기',
  '망고',
  '포도',
  '배',
  '참외',
  '수박',
  '두리안',
  '레몬',
  '체리',
  '키위',
  '복숭아',
  '무화과',
  '매실',
  '블루베리',
  '유자',
  '감',
  '자두',
  '용과',
  '자몽',
  '파인애플',
  '석류',
];

export const BINGO_FLOWER_WORDS: string[] = [
  '민들레',
  '해바라기',
  '장미',
  '국화',
  '나팔꽃',
  '무궁화',
  '초롱꽃',
  '은방울꽃',
  '데이지',
  '수선화',
  '벚꽃',
  '개나리',
  '히아신스',
  '팬지',
  '연꽃',
  '목련',
  '패랭이꽃',
  '카네이션',
  '구절초',
  '동백꽃',
  '수국',
  '봉선화',
  '코스모스',
  '튤립',
  '할미꽃',
];

export const BINGO_ANIMAL_WORDS: string[] = [
  '개',
  '고양이',
  '낙타',
  '타조',
  '비둘기',
  '펭귄',
  '곰',
  '호랑이',
  '사자',
  '말',
  '치타',
  '사슴',
  '두더지',
  '코끼리',
  '원숭이',
  '햄스터',
  '앵무새',
  '다람쥐',
  '너구리',
  '하마',
  '캥거루',
  '늑대',
  '박쥐',
  '토끼',
  '여우',
];

/** bingoEngine.BingoSubjectId 와 동일해야 함 */
export type BingoPoolSubjectId = 'fruit' | 'flower' | 'animal';

export const BINGO_WORD_POOLS: Record<BingoPoolSubjectId, string[]> = {
  fruit: BINGO_FRUIT_WORDS,
  flower: BINGO_FLOWER_WORDS,
  animal: BINGO_ANIMAL_WORDS,
};

/** 시안용 고정 5×5 과일 그리드 (데모·문서용) */
export const BINGO_FRUITS_5X5: string[][] = [
  ['사과', '바나나', '오렌지', '귤', '딸기'],
  ['망고', '포도', '배', '참외', '수박'],
  ['두리안', '레몬', '체리', '키위', '복숭아'],
  ['무화과', '매실', '블루베리', '유자', '감'],
  ['자두', '용과', '자몽', '파인애플', '석류'],
];
