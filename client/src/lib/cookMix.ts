import type { EquipmentRarity } from './equipmentRarity';

export type CookMixRule = {
    key: `${EquipmentRarity}+${EquipmentRarity}`;
    outcomes: Array<{ rarity: EquipmentRarity; chance: number }>;
};

export const COOK_MIX_RULES: CookMixRule[] = [
    { key: 'NORMAL+NORMAL', outcomes: [{ rarity: 'NORMAL', chance: 1 }] },
    { key: 'NORMAL+RARE', outcomes: [{ rarity: 'NORMAL', chance: 0.7 }, { rarity: 'RARE', chance: 0.3 }] },
    { key: 'NORMAL+EPIC', outcomes: [{ rarity: 'NORMAL', chance: 0.8 }, { rarity: 'RARE', chance: 0.2 }] },
    { key: 'NORMAL+LEGENDARY', outcomes: [{ rarity: 'NORMAL', chance: 0.9 }, { rarity: 'RARE', chance: 0.1 }] },
    { key: 'RARE+RARE', outcomes: [{ rarity: 'RARE', chance: 0.5 }, { rarity: 'NORMAL', chance: 0.5 }] },
    { key: 'RARE+EPIC', outcomes: [{ rarity: 'NORMAL', chance: 0.35 }, { rarity: 'RARE', chance: 0.55 }, { rarity: 'EPIC', chance: 0.1 }] },
    { key: 'RARE+LEGENDARY', outcomes: [{ rarity: 'NORMAL', chance: 0.35 }, { rarity: 'RARE', chance: 0.6 }, { rarity: 'EPIC', chance: 0.05 }] },
    { key: 'EPIC+EPIC', outcomes: [{ rarity: 'NORMAL', chance: 0.25 }, { rarity: 'RARE', chance: 0.35 }, { rarity: 'EPIC', chance: 0.4 }] },
    { key: 'EPIC+LEGENDARY', outcomes: [{ rarity: 'NORMAL', chance: 0.2 }, { rarity: 'RARE', chance: 0.35 }, { rarity: 'EPIC', chance: 0.45 }] },
    { key: 'LEGENDARY+LEGENDARY', outcomes: [{ rarity: 'NORMAL', chance: 0.1 }, { rarity: 'RARE', chance: 0.2 }, { rarity: 'EPIC', chance: 0.35 }, { rarity: 'LEGENDARY', chance: 0.35 }] },
];

export const rarityRank: Record<EquipmentRarity, number> = {
    NORMAL: 0,
    RARE: 1,
    EPIC: 2,
    LEGENDARY: 3,
};

export const sortPair = (a: EquipmentRarity, b: EquipmentRarity): `${EquipmentRarity}+${EquipmentRarity}` => {
    return rarityRank[a] <= rarityRank[b] ? `${a}+${b}` : `${b}+${a}`;
};

export const getCookMixOutcomes = (a: EquipmentRarity, b: EquipmentRarity) => {
    const key = sortPair(a, b);
    const rule = COOK_MIX_RULES.find((r) => r.key === key);
    const outcomes = rule?.outcomes ?? [{ rarity: 'NORMAL' as EquipmentRarity, chance: 1 }];
    const total = outcomes.reduce((sum, o) => sum + Math.max(0, o.chance), 0) || 1;
    return outcomes.map((o) => ({
        rarity: o.rarity,
        chancePct: (Math.max(0, o.chance) / total) * 100,
    }));
};
