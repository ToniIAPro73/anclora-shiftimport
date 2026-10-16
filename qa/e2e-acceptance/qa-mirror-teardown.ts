import { destroyState } from './helpers/qa-mirror';

export default async function globalTeardown() { destroyState(); }
