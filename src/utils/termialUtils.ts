import { createInterface } from 'node:readline/promises';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

export async function question(query: string): Promise<string> {
    return rl.question(query);
}

export function close(): void {
    rl.close();
}
