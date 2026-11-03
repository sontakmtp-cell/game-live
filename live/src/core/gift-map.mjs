// Gift Mapping Configuration — TikTok LIVE Arcade (v1.1)
// Spec: TECHNICAL_SPEC.md v1.1, Section 7.1

export const DEFAULT_GIFT_TIERS = {
  TIER_1_SMALL: {
    maxDiamonds: 10,
    toolId: 'knife',
    baseImpulse: 0.65,
    baseWear: 2,
    durationMs: 2400,
    contactMs: 800,
  },
  TIER_2_MEDIUM: {
    maxDiamonds: 99,
    toolId: 'scissors',
    baseImpulse: 0.85,
    baseWear: 4,
    durationMs: 2400,
    contactMs: 800,
  },
  TIER_3_HEAVY: {
    maxDiamonds: 99999,
    toolId: 'chainsaw',
    baseImpulse: 1.15,
    baseWear: 6,
    durationMs: 2600,
    contactMs: 850,
  },
};

/**
 * Ánh xạ quà tặng sang hành động đạo cụ tương ứng
 * @param {string} giftName Tên quà tặng
 * @param {number} diamonds Số kim cương của quà
 * @param {number} [count=1] Số lượng quà
 * @param {string} [preferredSide] 'left' hoặc 'right'
 */
export function resolveGiftAction(giftName = 'Hoa hồng', diamonds = 1, count = 1, preferredSide) {
  const dia = Math.max(1, Number(diamonds || 1));
  const c = Math.max(1, Number(count || 1));
  const totalValue = dia * c;

  let tier = DEFAULT_GIFT_TIERS.TIER_1_SMALL;
  if (totalValue > 99) {
    tier = DEFAULT_GIFT_TIERS.TIER_3_HEAVY;
  } else if (totalValue >= 10) {
    tier = DEFAULT_GIFT_TIERS.TIER_2_MEDIUM;
  }

  // Luân phiên bên trái/phải nếu không chỉ định
  const side = preferredSide || (Math.random() < 0.5 ? 'left' : 'right');
  const toolId = `${tier.toolId}_${side}`;
  const signedImpulse = side === 'left' ? tier.baseImpulse : -tier.baseImpulse;

  // Tính wear có tính đến combo (streak), có trần an toàn
  const wearDelta = Math.min(15, tier.baseWear + (c > 1 ? Math.min(5, Math.floor(Math.log2(c))) : 0));

  return {
    toolId,
    side,
    giftName,
    diamonds: dia,
    count: c,
    totalValue,
    contactMs: tier.contactMs,
    durationMs: tier.durationMs,
    impulseRadPerSec: signedImpulse,
    wearDelta,
    variant: 'touch',
  };
}
