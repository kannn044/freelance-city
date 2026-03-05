import type { Item } from '../stores/gameStore';

// Seeds
import chickenEggPng from '../assets/items/seeds/chicken_egg.png';
import beefCalfPng from '../assets/items/seeds/beef_calf.png';
import vegetableSeedPng from '../assets/items/seeds/vegetable_seed.png';
import crudeOilBarrelPng from '../assets/items/seeds/crude_oil_barrel.png';
import naturalGasCanisterPng from '../assets/items/seeds/natural_gas_canister.png';
import crystalGeodePng from '../assets/items/seeds/crystal_geode.png';
import herbSeedPng from '../assets/items/seeds/herb_seed.png';
import mushroomSporePng from '../assets/items/seeds/mushroom_spore.png';
import mineralSamplePng from '../assets/items/seeds/mineral_sample.png';

// Raw
import chickenMeatPng from '../assets/items/raw/chicken_meat.png';
import beefMeatPng from '../assets/items/raw/beef_meat.png';
import vegetablePng from '../assets/items/raw/vegetable.png';
import ironOrePng from '../assets/items/raw/iron_ore.png';
import copperOrePng from '../assets/items/raw/copper_ore.png';
import steelOrePng from '../assets/items/raw/steel_ore.png';
import stonePng from '../assets/items/raw/stone.png';
import gemPng from '../assets/items/raw/gem.png';
import gasPng from '../assets/items/raw/gas.png';
import crudeOilPng from '../assets/items/raw/crude_oil.png';
import rawGasPng from '../assets/items/raw/raw_gas.png';
import powerCrystalPng from '../assets/items/raw/power_crystal.png';
import scrapMetalPng from '../assets/items/raw/scrap_metal.png';
import medicinalHerbPng from '../assets/items/raw/medicinal_herb.png';
import luminousMushroomPng from '../assets/items/raw/luminous_mushroom.png';
import chemicalOrePng from '../assets/items/raw/chemical_ore.png';
import pollenPng from '../assets/items/raw/pollen.png';

// Ingredients
import saltPng from '../assets/items/ingredients/salt.png';
import coalPng from '../assets/items/ingredients/coal.png';
import fluxPng from '../assets/items/ingredients/flux.png';
import oilPng from '../assets/items/ingredients/oil.png';
import ironIngotPng from '../assets/items/ingredients/iron_ingot.png';
import copperIngotPng from '../assets/items/ingredients/copper_ingot.png';
import steelIngotPng from '../assets/items/ingredients/steel_ingot.png';
import fuelCellPng from '../assets/items/ingredients/fuel_cell.png';
import coolantPng from '../assets/items/ingredients/coolant.png';
import fertilizerPng from '../assets/items/ingredients/fertilizer.png';
import catalystPng from '../assets/items/ingredients/catalyst.png';
import distilledWaterPng from '../assets/items/ingredients/distilled_water.png';
import sulfurPng from '../assets/items/ingredients/sulfur.png';

// Meals
import chickenSaladPng from '../assets/items/meals/chicken_salad.png';
import beefSteakPng from '../assets/items/meals/beef_steak.png';
import beefStewPng from '../assets/items/meals/beef_stew.png';
import chickenStewPng from '../assets/items/meals/chicken_stew.png';
import healingPotionPng from '../assets/items/meals/healing_potion.png';
import growthElixirPng from '../assets/items/meals/growth_elixir.png';
import smeltersToncPng from '../assets/items/meals/smelters_tonic.png';
import manaElixirPng from '../assets/items/meals/mana_elixir.png';

// Permits
import miningPermitPng from '../assets/items/permits/mining_permit.png';

// Equipment - Provider
import sunHatPng from '../assets/items/equipment/provider/sun_hat.png';
import fieldShirtPng from '../assets/items/equipment/provider/field_shirt.png';
import cargoPantsPng from '../assets/items/equipment/provider/cargo_pants.png';
import sweatbandPng from '../assets/items/equipment/provider/sweatband.png';
import workGlovesPng from '../assets/items/equipment/provider/work_gloves.png';
import mudBootsPng from '../assets/items/equipment/provider/mud_boots.png';
import forkPng from '../assets/items/equipment/provider/fork.png';

// Equipment - Miner
import mattockPng from '../assets/items/equipment/miner/mattock.png';

// Equipment - Chef
import toqueBlanchePng from '../assets/items/equipment/chef/toque_blanche.png';
import apronPng from '../assets/items/equipment/chef/apron.png';
import slackPantsPng from '../assets/items/equipment/chef/slack_pants.png';
import wristSupportPng from '../assets/items/equipment/chef/wrist_support.png';
import latexGlovesPng from '../assets/items/equipment/chef/latex_gloves.png';
import antiSlipShoesPng from '../assets/items/equipment/chef/anti_slip_shoes.png';
import spatulaPng from '../assets/items/equipment/chef/spatula.png';

// Equipment - Blacksmith
import hammerPng from '../assets/items/equipment/blacksmith/hammer.png';

// Equipment - Engineer
import wrenchPng from '../assets/items/equipment/engineer/wrench.png';

// Equipment - Technician
import solderingIronPng from '../assets/items/equipment/technician/soldering_iron.png';

// Equipment - Agraria
import sicklePng from '../assets/items/equipment/agraria/sickle.png';

// Equipment - Medico
import mortarPestlePng from '../assets/items/equipment/medico/mortar_pestle.png';

const seedImageByName: Record<string, string> = {
    'Chicken Egg': chickenEggPng,
    'Beef Calf': beefCalfPng,
    'Vegetable Seed': vegetableSeedPng,
    'Ferrum Mining Permit': miningPermitPng,
    'Crude Oil Barrel': crudeOilBarrelPng,
    'Natural Gas Canister': naturalGasCanisterPng,
    'Crystal Geode': crystalGeodePng,
    'Herb Seed': herbSeedPng,
    'Mushroom Spore': mushroomSporePng,
    'Mineral Sample': mineralSamplePng,
};

const rawImageByName: Record<string, string> = {
    'Chicken Meat': chickenMeatPng,
    'Beef Meat': beefMeatPng,
    Vegetable: vegetablePng,
    'Iron Ore': ironOrePng,
    'Copper Ore': copperOrePng,
    'Steel Ore': steelOrePng,
    Stone: stonePng,
    Gem: gemPng,
    Gas: gasPng,
    'Crude Oil': crudeOilPng,
    'Raw Gas': rawGasPng,
    'Power Crystal': powerCrystalPng,
    'Scrap Metal': scrapMetalPng,
    'Medicinal Herb': medicinalHerbPng,
    'Luminous Mushroom': luminousMushroomPng,
    'Chemical Ore': chemicalOrePng,
    Pollen: pollenPng,
};

const ingredientImageByName: Record<string, string> = {
    Salt: saltPng,
    Coal: coalPng,
    Flux: fluxPng,
    Oil: oilPng,
    'Iron Ingot': ironIngotPng,
    'Copper Ingot': copperIngotPng,
    'Steel Ingot': steelIngotPng,
    'Fuel Cell': fuelCellPng,
    Coolant: coolantPng,
    Fertilizer: fertilizerPng,
    Catalyst: catalystPng,
    'Distilled Water': distilledWaterPng,
    Sulfur: sulfurPng,
};

const mealImageByName: Record<string, string> = {
    'Chicken Salad': chickenSaladPng,
    'Beef Steak': beefSteakPng,
    'Beef Stew': beefStewPng,
    'Chicken Stew': chickenStewPng,
    'Healing Potion': healingPotionPng,
    'Growth Elixir': growthElixirPng,
    "Smelter's Tonic": smeltersToncPng,
    'Mana Elixir': manaElixirPng,
};

const equipmentImageByName: Record<string, string> = {
    Mattock: mattockPng,
    Fork: forkPng,
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
    Hammer: hammerPng,
    Spatula: spatulaPng,
    Wrench: wrenchPng,
    'Soldering Iron': solderingIronPng,
    Sickle: sicklePng,
    'Mortar & Pestle': mortarPestlePng,
};

export const getEquipmentImageByName = (name?: string | null): string | null => {
    if (!name) return null;
    return equipmentImageByName[name] ?? null;
};

export const getImageByName = (name?: string | null): string | null => {
    if (!name) return null;
    return (
        seedImageByName[name] ??
        rawImageByName[name] ??
        ingredientImageByName[name] ??
        mealImageByName[name] ??
        equipmentImageByName[name] ??
        null
    );
};

export const getItemImageSrc = (item?: Item | null): string | null => {
    if (!item) return null;
    if (item.type === 'SEED') return seedImageByName[item.name] ?? null;
    if (item.type === 'RAW') return rawImageByName[item.name] ?? null;
    if (item.type === 'INGREDIENT') return ingredientImageByName[item.name] ?? null;
    if (item.type === 'MEAL') return mealImageByName[item.name] ?? null;
    if (item.type === 'EQUIPMENT') return equipmentImageByName[item.name] ?? null;
    return getImageByName(item.name);
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

    return <span style={{ fontSize: `${Math.max(12, size)}px`, lineHeight: 1 }}>{item?.icon ?? '□'}</span>;
};
