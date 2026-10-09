export function fakeGitHub(): {
  readonly calls: number;
  readonly head: string;
  readonly commitCount: number;
  fetch(request: Request): Promise<Response>;
};
