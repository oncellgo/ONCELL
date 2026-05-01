import { randomBytes } from 'crypto';

// 32자 URL-safe 랜덤 토큰 — 192-bit entropy.
// 추측·brute force 사실상 불가능 (충돌 확률 ≈ 0).
export function generateInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

// cell_ + 12자 random
export function generateCellId(): string {
  return `cell_${randomBytes(9).toString('base64url')}`;
}
