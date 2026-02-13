import type { Item } from '../stores/gameStore';

import chickenEggPng from '../assets/items/seeds/chicken_egg.png';
import beefCalfPng from '../assets/items/seeds/beef_calf.png';
import vegetableSeedPng from '../assets/items/seeds/vegetable_seed.png';
import chickenMeatPng from '../assets/items/raw/chicken_meat.png';
import beefMeatPng from '../assets/items/raw/beef_meat.png';
import vegetablePng from '../assets/items/raw/vegetable.png';
import saltPng from '../assets/items/ingredients/salt.png';
import sunHatPng from '../assets/items/equipment/provider/sun_hat.png';
import fieldShirtPng from '../assets/items/equipment/provider/field_shirt.png';
import cargoPantsPng from '../assets/items/equipment/provider/cargo_pants.png';
import sweatbandPng from '../assets/items/equipment/provider/sweatband.png';
import workGlovesPng from '../assets/items/equipment/provider/work_gloves.png';
import mudBootsPng from '../assets/items/equipment/provider/mud_boots.png';
import toqueBlanchePng from '../assets/items/equipment/chef/toque_blanche.png';
import apronPng from '../assets/items/equipment/chef/apron.png';
import slackPantsPng from '../assets/items/equipment/chef/slack_pants.png';
import wristSupportPng from '../assets/items/equipment/chef/wrist_support.png';
import latexGlovesPng from '../assets/items/equipment/chef/latex_gloves.png';
import antiSlipShoesPng from '../assets/items/equipment/chef/anti_slip_shoes.png';

const seedImageByName: Record<string, string> = {
    'Chicken Egg': chickenEggPng,
    'Beef Calf': beefCalfPng,
    'Vegetable Seed': vegetableSeedPng,
};

const rawImageByName: Record<string, string> = {
    'Chicken Meat': chickenMeatPng,
    'Beef Meat': beefMeatPng,
    Vegetable: vegetablePng,
};

const ingredientImageByName: Record<string, string> = {
    Salt: saltPng,
};

const equipmentImageByName: Record<string, string> = {
    'Sun Hat': sunHatPng,
    'Field Shirt': fieldShirtPng,
    'Cargo Pants': cargoPantsPng,
    Sweatband: sweatbandPng,
    'Work Gloves': workGlovesPng,
    'Mud Boots': mudBootsPng,
    'Toque Blanche': toqueBlanchePng,
    Apron: apronPng,
    'Slack Pants': slackPantsPng,
    'Wrist Support': wristSupportPng,
    'Latex Gloves': latexGlovesPng,
    'Anti-Slip Shoes': antiSlipShoesPng,
};

export const getEquipmentImageByName = (name?: string | null): string | null => {
    if (!name) return null;
    return equipmentImageByName[name] ?? null;
};

export const getItemImageSrc = (item?: Item | null): string | null => {
    if (!item) return null;
    if (item.type === 'SEED') return seedImageByName[item.name] ?? null;
    if (item.type === 'RAW') return rawImageByName[item.name] ?? null;
    if (item.type === 'INGREDIENT') return ingredientImageByName[item.name] ?? null;
    if (item.type === 'EQUIPMENT') return equipmentImageByName[item.name] ?? null;
    return null;
};

export const renderItemIcon = (item?: Item | null, size = 18) => {
    const src = getItemImageSrc(item);
    if (src) {
        return (
            <img
                src={src}
                alt={item?.name ?? 'item'}
                width={size}
                height={size}
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    objectFit: 'contain',
                    display: 'block',
                }}
            />
        );
    }

    return <span style={{ fontSize: `${Math.max(12, size)}px`, lineHeight: 1 }}>{item?.icon ?? '📦'}</span>;
};
