import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { BaseExtractor } from '../classes/BaseExtractor';
import { Jar } from '../classes/Jar';

export default class BiomesExtractor extends BaseExtractor {
    private readonly BIOMES_DIR = this.getRelativePath(
        'data/mt/tags/worldgen/biome'
    );
    private readonly BIOME_OVERRIDES: Record<string, string> = {
        lush_caves: 'lush_cave.json',
    };

    public async Extract(): Promise<unknown> {
        const predicates = await readdir(this.BIOMES_DIR);
        const loot = this.passingData['loot'];
        let biomesOut: Record<string, string[]> = {};
        for (const treasure of Object.keys(loot)) {
            const t = treasure.replace('_treasure', '');
            let biomeFile = predicates.find((c) => c.includes(t));
            if (!biomeFile) {
                biomeFile = this.BIOME_OVERRIDES[t];
            }
            if (!biomeFile && t === 'end') {
                biomesOut[treasure] = ['dimension: the end'];
                continue;
            }
            if (t === 'nether') {
                biomesOut[treasure] = ['nether wastes'];
                continue;
            }

            if (!biomeFile) {
                throw new Error('Biome file not found for ' + treasure);
            }

            const json = JSON.parse(
                await readFile(join(this.BIOMES_DIR, biomeFile), 'utf-8')
            );

            const biomes = await Promise.all(
                json.values.map(async (term: any) => {
                    if (term.startsWith('#c:')) return '';
                    if (term.startsWith('#minecraft:')) {
                        // Comes from the minecraft jar
                        return await this.getBiomesFromJar(term);
                    }
                    return term.replace('minecraft:', '').replace(/_/g, ' ');
                })
            );
            biomesOut[treasure] = biomes.flat().filter((b: string) => b !== '');
        }

        this.writeOut(biomesOut);
        return this.passingData;
    }

    private async getBiomesFromJar(predicate: string): Promise<string[]> {
        const jar = Jar.open(this.getRelativePath('client.jar'));
        const purePredicate = predicate.replace('#minecraft:', '');
        const path = `data/minecraft/tags/worldgen/biome/${purePredicate}.json`;
        const predicateJson = await jar.readJson(path);

        const biomes: string[] = [];
        for (const biome of predicateJson.values) {
            if (biome.startsWith('#c:')) continue;

            if (biome.startsWith('#minecraft:')) {
                const pureBiome = biome.replace('#minecraft:', '');
                const additionalBiomes = await this.getBiomesFromJar(pureBiome);
                biomes.push(...additionalBiomes);
            } else {
                biomes.push(biome.replace('minecraft:', '').replace(/_/g, ' '));
            }
        }
        return biomes;
    }
}
