import { BaseExtractor } from '../classes/BaseExtractor.js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { toJson } from 'really-relaxed-json';
import _ from 'lodash';
import diff from 'recursive-diff';

interface TreasureLoot {
    [key: string]: {
        [key: string]: PoolItem[];
    };
}

interface PoolItem {
    type: string;
    enchantments?: {
        type: string;
        min: number;
        max: number;
    }[];
    name?: string;
    nbt?: any;
    components?: any;
    lore?: string[];
    unbreakable?: boolean;
    attributes?: {
        name: string;
        type: string;
        min: number;
        max: number;
        slot: string;
    }[];
    enchantWithLevel?: number;
    conditions: {
        stoneMined?: {
            min?: number;
            max?: number;
        };
    };
    skullOwner?: string;
    skullHash?: string;
}

export default class LootExtractor extends BaseExtractor {
    public priority = 10;
    private readonly ROOT_LOOT_TABLE_DIR =
        this.getRelativePath('data/mt/loot_table');
    private readonly LOOT_TABLE_DIR = this.ROOT_LOOT_TABLE_DIR + '/chests';
    private readonly WHITELISTED_FILES = [
        'common.json',
        'rare.json',
        'epic.json',
        'legendary.json',
    ];
    private readonly EXCLUDED_DIRS = ['mythical'];
    private isDebugging = false;

    public async Extract(): Promise<unknown> {
        const initial = await this.ExtractInitial();
        if (!initial) {
            throw new Error('Failed to extract initial loot tables');
        }

        const updated = await this.ExtractDuplicates(initial);
        this.writeOut(updated);

        this.passingData['loot'] = updated;
        return this.passingData;
    }

    private async ExtractInitial() {
        const biomes = await readdir(this.LOOT_TABLE_DIR);
        let loot: TreasureLoot = {};
        for (const biome of biomes) {
            if (this.EXCLUDED_DIRS.includes(biome)) continue;

            loot[biome] = {};

            const tablesPath = join(this.LOOT_TABLE_DIR, biome);
            const tableFiles = (await readdir(tablesPath)).filter((file) =>
                file.endsWith('.json')
            );

            for (const tableFile of tableFiles) {
                if (!this.WHITELISTED_FILES.includes(tableFile)) continue;
                const rarity = this.determineRarity(tableFile);

                loot[biome][rarity] = await this.ExtractLootFile(
                    join(tablesPath, tableFile)
                );

                this.debug(
                    'Loot extracted for biome',
                    biome,
                    'with rarity',
                    rarity
                );
            }
        }
        return loot;
    }

    private async ExtractLootFile(file: string): Promise<PoolItem[]> {
        this.logger.info(
            'Extracting loot table',
            file.replace(this.LOOT_TABLE_DIR, '')
        );
        let loot: PoolItem[] = [];

        const tableContent = await readFile(file, 'utf-8');
        const table = JSON.parse(tableContent);

        if (typeof table.pools !== 'object') {
            this.extractor.warning(`Table ${file} has no pools`);
            return [];
        }

        for (const pool of table.pools) {
            for (const entry of pool.entries) {
                this.debug(entry);
                // Conditions
                let itemConditions: any = {};
                const conditions = entry.conditions;
                if (conditions) {
                    this.debug('Conditions found for item');
                    for (const condition of conditions) {
                        // Stone mined
                        if (condition.scores && condition.scores['mt.total']) {
                            this.debug('Stone mined condition found');
                            itemConditions.stoneMined = {};
                            itemConditions.stoneMined.min =
                                condition.scores['mt.total'].min;
                            itemConditions.stoneMined.max =
                                condition.scores['mt.total'].max;
                        }
                    }
                }

                if (entry.type === 'minecraft:loot_table') {
                    this.debug('Loot table found, extracting');
                    // mt:chests/savanna_treasure/savanna_helmet
                    const name = entry.value.replace('mt:', '') + '.json';

                    this.debug('Extracting loot table', name);

                    const subLoot = await this.ExtractLootFile(
                        join(this.ROOT_LOOT_TABLE_DIR, name)
                    );
                    const subLootWithCondition = subLoot.map(
                        (item: PoolItem) => {
                            return { ...item, conditions: itemConditions };
                        }
                    );
                    this.debug('Loot table extracted:', subLootWithCondition);
                    loot = [...loot, ...subLootWithCondition];
                }

                if (entry.type !== 'minecraft:item' && entry.type !== 'item') {
                    continue;
                }

                this.debug('Item found, extracting');
                let item: PoolItem = { type: entry.name, conditions: {} };
                if (entry.functions) {
                    this.debug('Item has functions');
                    // NBT modifications
                    const nbtModifications = entry.functions.filter(
                        (f: { function: string }) =>
                            /(minecraft:)?set_nbt/gm.test(f.function)
                    );
                    if (nbtModifications.length) {
                        this.debug('NBT modifications found');
                        for (const mod of nbtModifications) {
                            const nbtJson = JSON.parse(toJson(mod.tag));
                            if (nbtJson.display && nbtJson.display.Name) {
                                const parsedName = JSON.parse(
                                    nbtJson.display.Name
                                ).text;
                                if (parsedName) {
                                    item['name'] = parsedName;
                                }
                            }

                            if (nbtJson.display && nbtJson.display.Lore) {
                                const parsedLore = JSON.parse(
                                    '[' + nbtJson.display.Lore + ']'
                                ); // It's an array
                                if (parsedLore) {
                                    item['lore'] = parsedLore.map(
                                        (line: { text: string }) => line.text
                                    );
                                }
                            }

                            if (nbtJson.Unbreakable) {
                                item['unbreakable'] = true;
                            }
                            item['nbt'] = { ...item['nbt'], ...nbtJson };
                        }
                    }

                    // Attribute modifications
                    const attributeModifications = entry.functions.find(
                        (f: { function: string }) =>
                            /(minecraft:)?set_attributes/gm.test(f.function)
                    );
                    if (attributeModifications) {
                        this.debug('Attribute modifications found');
                        item['attributes'] =
                            attributeModifications.modifiers.map(
                                (modifier: any) => {
                                    return {
                                        name: modifier.attribute.replace(
                                            'minecraft:',
                                            ''
                                        ),
                                        type: modifier.operation,
                                        min: _.isObject(modifier.amount)
                                            ? modifier.amount.min
                                            : modifier.amount,
                                        max: _.isObject(modifier.amount)
                                            ? modifier.amount.max
                                            : modifier.amount,
                                        slot: modifier.slot
                                            ? _.isArray(modifier.slot)
                                                ? modifier.slot[0]
                                                : modifier.slot
                                            : undefined,
                                    };
                                }
                            );
                    }

                    // Enchantment modifications (apparently there can be multiple)
                    const enchantmentModificationsList = entry.functions.filter(
                        (f: { function: string }) =>
                            /(minecraft:)?set_enchantments/gm.test(f.function)
                    );

                    if (enchantmentModificationsList) {
                        this.debug('Enchantment modifications found');
                        let enchantments = [];
                        for (const enchantmentModifications of enchantmentModificationsList) {
                            for (const key of Object.keys(
                                enchantmentModifications.enchantments
                            )) {
                                enchantments.push({
                                    type: key.replace('minecraft:', ''),
                                    min:
                                        (_.isObject(
                                            enchantmentModifications
                                                .enchantments[key].min
                                        )
                                            ? enchantmentModifications
                                                  .enchantments[key].min.value
                                            : enchantmentModifications
                                                  .enchantments[key].min) ?? 1,
                                    max:
                                        (_.isObject(
                                            enchantmentModifications
                                                .enchantments[key].max
                                        )
                                            ? enchantmentModifications
                                                  .enchantments[key].max.value
                                            : enchantmentModifications
                                                  .enchantments[key].max) ?? 1,
                                });
                            }
                        }
                        item['enchantments'] = enchantments;
                    }

                    // Enchantment with levels
                    const enchantmentWithLevels = entry.functions.find(
                        (f: { function: string }) =>
                            /(minecraft:)?enchant_with_levels/gm.test(
                                f.function
                            )
                    );
                    if (enchantmentWithLevels) {
                        item['enchantWithLevel'] = enchantmentWithLevels.levels;
                    }
                    // Conditions
                    item.conditions = itemConditions;

                    // Name modification
                    const nameModifications = entry.functions.find(
                        (f: { function: string }) =>
                            /(minecraft:)?set_name/gm.test(f.function)
                    );
                    if (nameModifications && nameModifications.name) {
                        this.debug('Name modifications found');
                        // name doesnt HAVE to be an array, so check if it is first
                        if (Array.isArray(nameModifications.name)) {
                            item['name'] = nameModifications.name[0].text;
                        } else {
                            item['name'] = nameModifications.name.text;
                        }
                    }

                    // Lore modification
                    const loreModifications = entry.functions.find(
                        (f: { function: string }) =>
                            /(minecraft:)?set_lore/gm.test(f.function)
                    );
                    if (loreModifications && !item['lore']) {
                        this.debug('Lore modifications found');
                        item['lore'] = loreModifications.lore.map(
                            (line: { text: string }) => line.text
                        );
                    }

                    // Components (PAIN PAIN PAIN PAIN PAIN)
                    const componentModifications = entry.functions.find(
                        (f: { function: string }) =>
                            /(minecraft:)?set_components/gm.test(f.function)
                    );
                    if (
                        componentModifications &&
                        componentModifications.components
                    ) {
                        this.debug('Component modifications found');
                        // Unbreakable
                        const keys = Object.keys(
                            componentModifications.components
                        );
                        if (keys.includes('minecraft:unbreakable')) {
                            item['unbreakable'] = true;
                        }

                        // Name
                        if (keys.includes('minecraft:custom_name')) {
                            const nameJson = toJson(
                                componentModifications.components[
                                    'minecraft:custom_name'
                                ]
                            );
                            item['name'] = JSON.parse(nameJson).text;
                        }

                        // Lore
                        if (keys.includes('minecraft:lore')) {
                            const loreJsonArray =
                                componentModifications.components[
                                    'minecraft:lore'
                                ].map((line: string) => toJson(line));

                            item['lore'] = loreJsonArray.map((line: string) => {
                                return JSON.parse(line).text;
                            });
                        }

                        if (keys.includes('minecraft:profile')) {
                            // This key is either a string or an object, if its a string we just set
                            if (
                                typeof componentModifications.components[
                                    'minecraft:profile'
                                ] === 'string'
                            ) {
                                item['skullOwner'] =
                                    componentModifications.components[
                                        'minecraft:profile'
                                    ];
                            } else {
                                const textureBase64 =
                                    componentModifications.components[
                                        'minecraft:profile'
                                    ].properties[0].value;
                                const rawTextureJson = Buffer.from(
                                    textureBase64,
                                    'base64'
                                ).toString();
                                const textureJson = JSON.parse(
                                    rawTextureJson
                                ) as { textures: { SKIN: { url: string } } };

                                const url = textureJson.textures.SKIN.url;
                                const hash = url
                                    .split('/texture/')[1]
                                    .split('.png')[0];
                                item['skullHash'] = hash;
                            }
                        }

                        if (keys.includes('minecraft:item_model')) {
                            item['type'] =
                                componentModifications.components[
                                    'minecraft:item_model'
                                ];
                        }

                        if (keys.includes('minecraft:item_name')) {
                            const value = JSON.parse(
                                componentModifications.components[
                                    'minecraft:item_name'
                                ]
                            );

                            // name doesnt HAVE to be an array, so check if it is first
                            if (Array.isArray(value)) {
                                item['name'] = value[0].text;
                            } else {
                                item['name'] = value.text;
                            }
                        }

                        // Store raw component json
                        item['components'] = componentModifications.components;
                    }
                }

                item['type'] = item['type'].replace('minecraft:', '');
                if (!loot.includes(item)) loot.push(item);
                this.debug('Item extracted', item);
            }
        }

        this.debug(loot);
        return loot;
    }

    private async ExtractDuplicates(loot: TreasureLoot): Promise<TreasureLoot> {
        let newLoot: TreasureLoot = {};
        const ignoredItems: PoolItem[] = [];

        for (const biome of Object.keys(loot)) {
            newLoot[biome] = {};
            for (const rarity of Object.keys(loot[biome])) {
                newLoot[biome][rarity] = [];
                for (let item of loot[biome][rarity]) {
                    if (ignoredItems.includes(item)) {
                        continue;
                    }

                    let duplicateItems = loot[biome][rarity].filter(
                        (i) => i.type === item.type
                    );
                    if (item.name)
                        duplicateItems = duplicateItems.filter(
                            (i) => i.name === item.name
                        );

                    if (duplicateItems.length == 1) {
                        newLoot[biome][rarity].push(item);
                        continue;
                    }

                    let newItem = Object.assign({}, item);
                    for (const i of duplicateItems) {
                        // Check for changes in attributes
                        const attrDiffs = diff.getDiff(
                            newItem.attributes,
                            i.attributes,
                            true
                        );
                        if (attrDiffs.length > 1) {
                            for (const difference of attrDiffs) {
                                // if (["generic.attack_damage"].includes(newItem.attributes[difference.path[0]].name)) continue;
                                if (difference.path[1] === 'min')
                                    newItem.attributes![
                                        difference.path[0] as number
                                    ].min = Math.min(
                                        difference.val,
                                        (difference as { oldVal: number })
                                            .oldVal
                                    );
                                if (difference.path[1] === 'max')
                                    newItem.attributes![
                                        difference.path[0] as number
                                    ].max = Math.max(
                                        difference.val,
                                        (difference as { oldVal: number })
                                            .oldVal
                                    );
                            }
                        }

                        const enchDiffs = diff.getDiff(
                            newItem.enchantments,
                            i.enchantments,
                            true
                        );
                        if (enchDiffs.length > 1) {
                            for (const difference of enchDiffs) {
                                if (difference.path[1] === 'min')
                                    newItem.enchantments![
                                        difference.path[0] as number
                                    ].min = Math.min(
                                        difference.val,
                                        (difference as { oldVal: number })
                                            .oldVal
                                    );
                                if (difference.path[1] === 'max')
                                    newItem.enchantments![
                                        difference.path[0] as number
                                    ].max = Math.max(
                                        difference.val,
                                        (difference as { oldVal: number })
                                            .oldVal
                                    );
                            }
                        }
                        ignoredItems.push(i);
                    }
                    newLoot[biome][rarity].push(newItem);
                }
            }
        }
        return newLoot;
    }

    private determineRarity(file: string) {
        if (file.includes('common')) return 'common';
        if (file.includes('rare')) return 'rare';
        if (file.includes('epic')) return 'epic';
        if (file.includes('legendary')) return 'legendary';
        return 'legendary';
    }

    private debug(...args: any) {
        if (this.isDebugging) {
            this.logger.debug(...args);
        }
    }
}
