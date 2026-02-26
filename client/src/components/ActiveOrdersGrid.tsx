import { useAuthStore } from '../stores/authStore';
import AgrariaActiveOrders from './active-orders/AgrariaActiveOrders';
import FerrumActiveOrders from './active-orders/FerrumActiveOrders';
import VoltaraActiveOrders from './active-orders/VoltaraActiveOrders';
import MedicoActiveOrders from './active-orders/MedicoActiveOrders';

const ActiveOrdersGrid = () => {
    const user = useAuthStore((s) => s.user);
    const mode = user?.city?.workspace_modes?.first_job ?? 'FARM';

    if (mode === 'MINE') return <FerrumActiveOrders />;
    if (mode === 'EXTRACT') return <VoltaraActiveOrders />;
    if (mode === 'FORAGE') return <MedicoActiveOrders />;
    return <AgrariaActiveOrders />;
};

export default ActiveOrdersGrid;
