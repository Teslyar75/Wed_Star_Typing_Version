/** Порядок клеток Горбова: чёрное 1, красное max, чёрное 2, красное max-1… */
export function gorbovSequence(n: number): { color: "b" | "r"; value: number }[] {
  const cells = n * n;
  const black = Math.floor((cells + 1) / 2);
  const red = cells - black;
  const seq: { color: "b" | "r"; value: number }[] = [];
  for (let i = 0; i < black; i++) {
    seq.push({ color: "b", value: i + 1 });
    if (i < red) seq.push({ color: "r", value: red - i });
  }
  return seq;
}

export function shuffleGorbovGrid(n: number): { color: "b" | "r"; value: number }[] {
  const cells = n * n;
  const black = Math.floor((cells + 1) / 2);
  const red = cells - black;
  const cellsArr: { color: "b" | "r"; value: number }[] = [];
  for (let i = 1; i <= black; i++) cellsArr.push({ color: "b", value: i });
  for (let i = 1; i <= red; i++) cellsArr.push({ color: "r", value: i });
  return cellsArr.sort(() => Math.random() - 0.5);
}
