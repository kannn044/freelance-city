const toNumber = (value: unknown, fallback = 0): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const normalizeCityMetadata = (city: any) => {
    if (!city) return city;

    const labels = city.occupation_labels ?? {};
    const modes = city.workspace_modes ?? {};

    return {
        ...city,
        occupation_labels: {
            first_job: labels.first_job ?? 'First Job',
            secondary_job: labels.secondary_job ?? 'Secondary Job',
        },
        workspace_modes: {
            first_job: modes.first_job ?? 'FARM',
            secondary_job: modes.secondary_job ?? 'COOK',
        },
        first_job_special_task_item_name:
            city.first_job_special_task_item_name
            ?? null,
    };
};

export const toJobPayload = <T extends Record<string, any>>(user: T): T & Record<string, number> => {
    const firstJobLevel = toNumber(user.first_job_level ?? user.first_job_level);
    const firstJobExp = toNumber(user.first_job_exp ?? user.first_job_exp);
    const secondaryJobLevel = toNumber(user.secondary_job_level ?? user.secondary_job_level);
    const secondaryJobExp = toNumber(user.secondary_job_exp ?? user.secondary_job_exp);

    const firstJobSkillVeg = toNumber(user.first_job_skill_veg);
    const firstJobSkillChicken = toNumber(user.first_job_skill_chicken);
    const firstJobSkillBeef = toNumber(user.first_job_skill_beef);

    const secondaryJobSkillVeg = toNumber(user.secondary_job_skill_veg);
    const secondaryJobSkillChicken = toNumber(user.secondary_job_skill_chicken);
    const secondaryJobSkillBeef = toNumber(user.secondary_job_skill_beef);

    return {
        ...user,
        city: normalizeCityMetadata((user as any).city),
        first_job_level: firstJobLevel,
        first_job_exp: firstJobExp,
        first_job_skill_veg: firstJobSkillVeg,
        first_job_skill_chicken: firstJobSkillChicken,
        first_job_skill_beef: firstJobSkillBeef,
        secondary_job_level: secondaryJobLevel,
        secondary_job_exp: secondaryJobExp,
        secondary_job_skill_veg: secondaryJobSkillVeg,
        secondary_job_skill_chicken: secondaryJobSkillChicken,
        secondary_job_skill_beef: secondaryJobSkillBeef,
    };
};
