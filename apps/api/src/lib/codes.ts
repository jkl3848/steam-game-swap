const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateSwapCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}
