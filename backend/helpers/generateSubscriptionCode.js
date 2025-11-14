import { customAlphabet } from 'nanoid/non-secure';

const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const generateSubscriptionCode = () => {
    const generator = customAlphabet(alphabet, 12);
    const raw = generator();
    return `${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;
};