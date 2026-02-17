import { motion } from 'framer-motion';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { Sprout, ChefHat } from 'lucide-react';
import { renderItemIcon } from '../lib/itemVisual';

const WorkspacePanel = () => {
    const { inventory, recipes, recipeShop, startFarm, startCook } = useGameStore();
    const user = useAuthStore((s) => s.user);

    const canFarm = (user?.provider_level ?? 0) > 0;
    const canCook = (user?.chef_level ?? 0) > 0;

    // Seeds in inventory (for providers to farm)
    const seedSlots = inventory.filter((s) => s.item?.type === 'SEED');

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                height: 'auto',
                overflowY: 'auto',
                overflowX: 'hidden',
                boxSizing: 'border-box',
                borderRadius: '0.75rem',
            }}
        >
            <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.5rem',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '0.55rem',
                }}
            >
                {!canFarm && !canCook && (
                    <p style={{
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.35)',
                        textAlign: 'center',
                        padding: '1rem 0',
                    }}>
                        No workspace actions available yet.
                    </p>
                )}

                {canFarm && (
                    <>
                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Sprout style={{ width: '0.7rem', height: '0.7rem' }} /> Farm your seeds
                        </div>
                        {seedSlots.length === 0 ? (
                            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                                No seeds in inventory.
                            </p>
                        ) : (
                            seedSlots.map((slot) => (
                                <motion.button
                                    key={slot.id}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => slot.item && startFarm(slot.item.id, 1)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.55rem 0.6rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'rgba(255,255,255,0.03)',
                                        color: 'rgba(255,255,255,0.9)',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                        {renderItemIcon(slot.item, 15)} {slot.item?.name} (x{slot.quantity})
                                    </span>
                                </motion.button>
                            ))
                        )}
                    </>
                )}

                {canCook && (
                    <>
                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <ChefHat style={{ width: '0.7rem', height: '0.7rem' }} /> Cook a recipe
                        </div>

                        {recipes.length > 0 && (
                            recipes.map((recipe) => (
                                <motion.button
                                    key={recipe.id}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => startCook(recipe.id)}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.25rem',
                                        padding: '0.55rem 0.6rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'rgba(255,255,255,0.03)',
                                        color: 'rgba(255,255,255,0.8)',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                    }}
                                >
                                    <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                                        {recipe.output_item.icon} {recipe.name}
                                    </span>
                                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)' }}>
                                        {recipe.ingredients.map((i) => `${i.quantity}x ${i.item.icon}${i.item.name}`).join(' + ')}
                                    </span>
                                </motion.button>
                            ))
                        )}

                        {recipeShop.length > 0 && (
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.42)' }}>
                                Some recipes are locked. Buy recipe scrolls in NPC Shop.
                            </div>
                        )}

                        {recipes.length === 0 && recipeShop.length === 0 && (
                            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                                No recipes available.
                            </p>
                        )}
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default WorkspacePanel;
