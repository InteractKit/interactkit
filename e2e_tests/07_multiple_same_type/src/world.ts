import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { TeamA } from './team-a.js';
import { TeamB } from './team-b.js';

@Entity()
export class World extends BaseEntity {
  @Describe() describe() { return 'World'; }
  @Component() private teamA!: TeamA;
  @Component() private teamB!: TeamB;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[07] === State isolation ===');

    // Store 10 in A, 5 in B
    for (let i = 0; i < 10; i++) await this.teamA.storeA({ text: `item-${i}` });
    for (let i = 0; i < 5; i++) await this.teamB.storeB({ text: `item-${i}` });

    const countA = await this.teamA.countA();
    const countB = await this.teamB.countB();
    console.log(`[07] A count: ${countA}, B count: ${countB}`);

    // Verify entries don't leak
    const entriesA = await this.teamA.getA();
    const entriesB = await this.teamB.getB();
    const aHasB = entriesA.some((e: string) => e.startsWith('B:'));
    const bHasA = entriesB.some((e: string) => e.startsWith('A:'));
    console.log(`[07] A has B entries: ${aHasB}`);
    console.log(`[07] B has A entries: ${bHasA}`);

    console.log('[07] === Parallel to both ===');
    await Promise.all([
      ...Array.from({ length: 20 }, (_, i) => this.teamA.storeA({ text: `par-${i}` })),
      ...Array.from({ length: 20 }, (_, i) => this.teamB.storeB({ text: `par-${i}` })),
    ]);
    const finalA = await this.teamA.countA();
    const finalB = await this.teamB.countB();
    console.log(`[07] final A: ${finalA}, final B: ${finalB}`);

    console.log('[07] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
