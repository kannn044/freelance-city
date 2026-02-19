import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding items...");

    // ─── Raw materials / Seeds ───────────────────────────
    const chickenSeed = await prisma.item.upsert({
        where: { name: "Chicken Egg" },
        update: { exp_value: 0.5 },
        create: {
            name: "Chicken Egg",
            type: "SEED",
            buy_price: 50,
            max_stack: 10,
            grow_mins: 10,
            exp_value: 0.5,
            icon: "chicken_egg",
        },
    });

    const beefCalf = await prisma.item.upsert({
        where: { name: "Beef Calf" },
        update: { exp_value: 0.8 },
        create: {
            name: "Beef Calf",
            type: "SEED",
            buy_price: 120,
            max_stack: 10,
            grow_mins: 20,
            exp_value: 0.8,
            icon: "beef_calf",
        },
    });

    const vegSeed = await prisma.item.upsert({
        where: { name: "Vegetable Seed" },
        update: { exp_value: 0.3 },
        create: {
            name: "Vegetable Seed",
            type: "SEED",
            buy_price: 30,
            max_stack: 10,
            grow_mins: 8,
            exp_value: 0.3,
            icon: "vegetable_seed",
        },
    });

    // ─── Raw produce ─────────────────────────────────────
    const chickenMeat = await prisma.item.upsert({
        where: { name: "Chicken Meat" },
        update: { exp_value: 1.0 },
        create: {
            name: "Chicken Meat",
            type: "RAW",
            sell_price: 80,
            max_stack: 5,
            exp_value: 1.0,
            icon: "chicken_meat",
        },
    });

    const beefMeat = await prisma.item.upsert({
        where: { name: "Beef Meat" },
        update: { exp_value: 1.5 },
        create: {
            name: "Beef Meat",
            type: "RAW",
            sell_price: 180,
            max_stack: 5,
            exp_value: 1.5,
            icon: "beef_meat",
        },
    });

    const vegetable = await prisma.item.upsert({
        where: { name: "Vegetable" },
        update: { exp_value: 0.5 },
        create: {
            name: "Vegetable",
            type: "RAW",
            sell_price: 40,
            max_stack: 10,
            exp_value: 0.5,
            icon: "vegetable",
        },
    });

    // ─── Ingredients ─────────────────────────────────────
    const salt = await prisma.item.upsert({
        where: { name: "Salt" },
        update: { exp_value: 0.2 },
        create: {
            name: "Salt",
            type: "INGREDIENT",
            buy_price: 20,
            max_stack: 20,
            exp_value: 0.2,
            icon: "salt",
        },
    });

    // ─── Equipment ────────────────────────────────────────
    const equipments: Array<{
        name: string;
        icon: string;
        role: "PROVIDER" | "CHEF";
        slot: "HEAD" | "UPPER_BODY" | "LOWER_BODY" | "ARM" | "GLOVE" | "SHOE";
        buyPrice: number;
        effectKey: string;
        effectValue: number;
        effectValue2?: number;
    }> = [
        { name: "Sun Hat", icon: "sun_hat", role: "PROVIDER", slot: "HEAD", buyPrice: 320, effectKey: "hunger_penalty_tier_reduction", effectValue: 1 },
        { name: "Toque Blanche", icon: "toque_blanche", role: "CHEF", slot: "HEAD", buyPrice: 360, effectKey: "cook_secondary_ingredient_save_chance", effectValue: 0.1 },
        { name: "Field Shirt", icon: "field_shirt", role: "PROVIDER", slot: "UPPER_BODY", buyPrice: 420, effectKey: "max_hunger_bonus", effectValue: 300 },
        { name: "Apron", icon: "apron", role: "CHEF", slot: "UPPER_BODY", buyPrice: 440, effectKey: "max_hunger_and_satiety_bonus", effectValue: 150, effectValue2: 0.1 },
        { name: "Cargo Pants", icon: "cargo_pants", role: "PROVIDER", slot: "LOWER_BODY", buyPrice: 520, effectKey: "raw_stack_bonus", effectValue: 5 },
        { name: "Slack Pants", icon: "slack_pants", role: "CHEF", slot: "LOWER_BODY", buyPrice: 520, effectKey: "ingredient_stack_bonus", effectValue: 5 },
        { name: "Sweatband", icon: "sweatband", role: "PROVIDER", slot: "ARM", buyPrice: 600, effectKey: "farm_time_reduction_pct", effectValue: 0.1 },
        { name: "Wrist Support", icon: "wrist_support", role: "CHEF", slot: "ARM", buyPrice: 600, effectKey: "cook_time_reduction_pct", effectValue: 0.1 },
        { name: "Work Gloves", icon: "work_gloves", role: "PROVIDER", slot: "GLOVE", buyPrice: 650, effectKey: "farm_double_yield_chance", effectValue: 0.08 },
        { name: "Latex Gloves", icon: "latex_gloves", role: "CHEF", slot: "GLOVE", buyPrice: 650, effectKey: "gourmet_chance", effectValue: 0.08 },
        { name: "Mud Boots", icon: "mud_boots", role: "PROVIDER", slot: "SHOE", buyPrice: 700, effectKey: "hunger_decay_reduction_per_min", effectValue: 1.5 },
        { name: "Anti-Slip Shoes", icon: "anti_slip_shoes", role: "CHEF", slot: "SHOE", buyPrice: 700, effectKey: "cook_state_hunger_decay_reduction_pct", effectValue: 0.2 },
    ];

    for (const eq of equipments) {
        await prisma.item.upsert({
            where: { name: eq.name },
            update: {
                type: "EQUIPMENT",
                buy_price: eq.buyPrice,
                max_stack: 1,
                icon: eq.icon,
                exp_value: 0,
                equipment_role: eq.role,
                equipment_slot: eq.slot,
                effect_key: eq.effectKey,
                effect_value: eq.effectValue,
                effect_value2: eq.effectValue2 ?? null,
            } as any,
            create: {
                name: eq.name,
                type: "EQUIPMENT",
                buy_price: eq.buyPrice,
                max_stack: 1,
                icon: eq.icon,
                exp_value: 0,
                equipment_role: eq.role,
                equipment_slot: eq.slot,
                effect_key: eq.effectKey,
                effect_value: eq.effectValue,
                effect_value2: eq.effectValue2 ?? null,
            } as any,
        });
    }

    // ─── Link seeds to yields ────────────────────────────
    await prisma.item.update({
        where: { id: chickenSeed.id },
        data: { yield_item_id: chickenMeat.id, yield_qty: 1 },
    });
    await prisma.item.update({
        where: { id: beefCalf.id },
        data: { yield_item_id: beefMeat.id, yield_qty: 1 },
    });
    await prisma.item.update({
        where: { id: vegSeed.id },
        data: { yield_item_id: vegetable.id, yield_qty: 2 },
    });

    // ─── Meals ───────────────────────────────────────────
    const chickenSalad = await prisma.item.upsert({
        where: { name: "Chicken Salad" },
        update: { exp_value: 2.0 },
        create: {
            name: "Chicken Salad",
            type: "MEAL",
            sell_price: 150,
            kcal: 80,
            buff_pct: 0.05,
            buff_mins: 30,
            max_stack: 3,
            exp_value: 2.0,
            icon: "chicken_salad",
        },
    });

    const beefSteak = await prisma.item.upsert({
        where: { name: "Beef Steak" },
        update: { exp_value: 3.0 },
        create: {
            name: "Beef Steak",
            type: "MEAL",
            sell_price: 400,
            kcal: 360,
            buff_pct: 0.15,
            buff_mins: 60,
            max_stack: 3,
            exp_value: 3.0,
            icon: "beef_steak",
        },
    });

    // ─── Recipes ─────────────────────────────────────────
    console.log("Seeding recipes...");

    // Chicken Salad: 1 Chicken Meat + 2 Vegetable
    const saladRecipe = await prisma.recipe.upsert({
        where: { name: "Chicken Salad" },
        update: { unlock_price: 250 },
        create: {
            name: "Chicken Salad",
            output_item_id: chickenSalad.id,
            output_qty: 1,
            cook_mins: 5,
            unlock_price: 250,
        },
    });

    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: saladRecipe.id, item_id: chickenMeat.id } },
        update: {},
        create: { recipe_id: saladRecipe.id, item_id: chickenMeat.id, quantity: 1 },
    });
    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: saladRecipe.id, item_id: vegetable.id } },
        update: {},
        create: { recipe_id: saladRecipe.id, item_id: vegetable.id, quantity: 2 },
    });

    // Beef Steak: 1 Beef Meat + 1 Vegetable + 1 Salt
    const steakRecipe = await prisma.recipe.upsert({
        where: { name: "Beef Steak" },
        update: { unlock_price: 600 },
        create: {
            name: "Beef Steak",
            output_item_id: beefSteak.id,
            output_qty: 1,
            cook_mins: 10,
            unlock_price: 600,
        },
    });

    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: steakRecipe.id, item_id: beefMeat.id } },
        update: {},
        create: { recipe_id: steakRecipe.id, item_id: beefMeat.id, quantity: 1 },
    });
    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: steakRecipe.id, item_id: vegetable.id } },
        update: {},
        create: { recipe_id: steakRecipe.id, item_id: vegetable.id, quantity: 1 },
    });
    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: steakRecipe.id, item_id: salt.id } },
        update: {},
        create: { recipe_id: steakRecipe.id, item_id: salt.id, quantity: 1 },
    });

    console.log("Seed complete!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
