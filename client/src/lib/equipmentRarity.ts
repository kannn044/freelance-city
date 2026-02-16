export type EquipmentRarity = 'NORMAL' | 'RARE' | 'EPIC' | 'LEGENDARY';

export const EQUIPMENT_RARITY_LABEL: Record<EquipmentRarity, string> = {
    NORMAL: 'Normal',
    RARE: 'Rare',
    EPIC: 'Epic',
    LEGENDARY: 'Legendary',
};

export const EQUIPMENT_RARITY_COLOR: Record<EquipmentRarity, string> = {
    NORMAL: 'rgba(255,255,255,0.6)',
    RARE: '#60a5fa',
    EPIC: '#a78bfa',
    LEGENDARY: '#facc15',
};

export const EQUIPMENT_RARITY_MULTIPLIER: Record<EquipmentRarity, number> = {
    NORMAL: 0.25,
    RARE: 0.5,
    EPIC: 0.75,
    LEGENDARY: 1,
};

export const getEquipmentRarityColor = (rarity?: string | null) => {
    if (!rarity) return EQUIPMENT_RARITY_COLOR.NORMAL;
    const key = rarity.toUpperCase() as EquipmentRarity;
    return EQUIPMENT_RARITY_COLOR[key] ?? EQUIPMENT_RARITY_COLOR.NORMAL;
};

export const getEquipmentRarityLabel = (rarity?: string | null) => {
    if (!rarity) return EQUIPMENT_RARITY_LABEL.NORMAL;
    const key = rarity.toUpperCase() as EquipmentRarity;
    return EQUIPMENT_RARITY_LABEL[key] ?? EQUIPMENT_RARITY_LABEL.NORMAL;
};

export const getEquipmentRarityMultiplier = (rarity?: string | null) => {
    if (!rarity) return EQUIPMENT_RARITY_MULTIPLIER.NORMAL;
    const key = rarity.toUpperCase() as EquipmentRarity;
    return EQUIPMENT_RARITY_MULTIPLIER[key] ?? EQUIPMENT_RARITY_MULTIPLIER.NORMAL;
};
