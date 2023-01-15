import { BaseExtractor } from "../classes/BaseExtractor.js";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { toJson } from "really-relaxed-json";
import _ from 'lodash';
import diff from 'recursive-diff';

interface TreasureLoot {
    [key: string]: {
        [key: string]: PoolItem[];
    }
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
}

export default class LootExtractor extends BaseExtractor {

    public priority = 10;
    private readonly LOOT_TABLE_DIR = this.getRelativePath('data/minecraft/loot_tables/chests');
    private readonly IGNORED_FILES = ["mineshaft.json"];


    public async Extract(): Promise<unknown> {
        const initial = await this.ExtractInitial();
        if (!initial) {
            throw new Error("Failed to extract initial loot tables");
        }

        const updated = await this.ExtractDuplicates(initial);
        this.writeOut(updated);

        this.passingData["loot"] = updated;
        return this.passingData;
    }

    private async ExtractInitial() {
        const biomes = await readdir(this.LOOT_TABLE_DIR);
        let loot: TreasureLoot = {};
        for (const biome of biomes) {
            loot[biome] = {};

            const tablesPath = join(this.LOOT_TABLE_DIR, biome);
            const tableFiles = await readdir(tablesPath);

            for (const tableFile of tableFiles) {
                if (this.IGNORED_FILES.includes(tableFile)) continue;
                const rarity = this.determineRarity(tableFile);

                const tableContent = await readFile(join(tablesPath, tableFile), "utf-8");
                const table = JSON.parse(tableContent);

                if (loot[biome][rarity] === undefined) loot[biome][rarity] = [];

                for (const pool of table.pools) {
                    for (const entry of pool.entries) {
                        if (entry.type !== "minecraft:item" && entry.type !== "item") {
                            continue;
                        }

                        let item: PoolItem = { type: entry.name };
                        if (entry.functions) {

                            // NBT modifications
                            const nbtModifications = entry.functions.filter((f: { function: string }) => /(minecraft:)?set_nbt/gm.test(f.function));
                            if (nbtModifications.length) {
                                for (const mod of nbtModifications) {
                                    const nbtJson = JSON.parse(toJson(mod.tag))
                                    if (nbtJson.display && nbtJson.display.Name) {
                                        const parsedName = JSON.parse(nbtJson.display.Name).text;
                                        if (parsedName) {
                                            item["name"] = parsedName;
                                        }
                                    }

                                    if (nbtJson.display && nbtJson.display.Lore) {
                                        const parsedLore = JSON.parse("[" + nbtJson.display.Lore + "]"); // It's an array
                                        if (parsedLore) {
                                            item["lore"] = parsedLore.map((line: { text: string }) => line.text)
                                        }
                                    }

                                    if (nbtJson.Unbreakable) {
                                        item["unbreakable"] = true;
                                    }
                                    item["nbt"] = { ...item["nbt"], ...nbtJson };
                                }
                            }

                            // Attribute modifications
                            const attributeModifications = entry.functions.find((f: { function: string }) => /(minecraft:)?set_attributes/gm.test(f.function));
                            if (attributeModifications) {
                                item["attributes"] = attributeModifications.modifiers.map((modifier: any) => {
                                    return {
                                        name: modifier.attribute.replace("minecraft:", ""),
                                        type: modifier.operation,
                                        min: _.isObject(modifier.amount) ? modifier.amount.min : modifier.amount,
                                        max: _.isObject(modifier.amount) ? modifier.amount.max : modifier.amount,
                                        slot: modifier.slot ? (_.isArray(modifier.slot) ? modifier.slot[0] : modifier.slot) : undefined
                                    }
                                });
                            }

                            // Enchantment modifications
                            const enchantmentModifications = entry.functions.find((f: { function: string }) => /(minecraft:)?set_enchantments/gm.test(f.function));
                            if (enchantmentModifications) {
                                let enchantments = [];
                                for (const key of Object.keys(enchantmentModifications.enchantments)) {
                                    enchantments.push({
                                        type: key.replace('minecraft:', ''),
                                        min: (_.isObject(enchantmentModifications.enchantments[key].min) ? enchantmentModifications.enchantments[key].min.value : enchantmentModifications.enchantments[key].min) ?? 1,
                                        max: (_.isObject(enchantmentModifications.enchantments[key].max) ? enchantmentModifications.enchantments[key].max.value : enchantmentModifications.enchantments[key].max) ?? 1
                                    })
                                }
                                item["enchantments"] = enchantments
                            }

                            // Enchantment with levels
                            const enchantmentWithLevels = entry.functions.find((f: { function: string }) => /(minecraft:)?enchant_with_levels/gm.test(f.function));
                            if (enchantmentWithLevels) {
                                item["enchantWithLevel"] = enchantmentWithLevels.levels
                            }

                            // Name modification
                            const nameModifications = entry.functions.find((f: { function: string }) => /(minecraft:)?set_name/gm.test(f.function));
                            if (nameModifications && nameModifications.name) {

                                item["name"] = nameModifications.name[0].text;
                            }

                            // Lore modification
                            const loreModifications = entry.functions.find((f: { function: string }) => /(minecraft:)?set_lore/gm.test(f.function));
                            if (loreModifications && !item["lore"]) {
                                item["lore"] = loreModifications.lore.map((line: { text: string }) => line.text);
                            }
                        }

                        item["type"] = item["type"].replace("minecraft:", "");
                        if (!loot[biome][rarity].includes(item)) loot[biome][rarity].push(item);
                    }
                }
            }
        }
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

                    let duplicateItems = loot[biome][rarity].filter(i => i.type === item.type);
                    if (item.name) duplicateItems = duplicateItems.filter(i => i.name === item.name);

                    if (duplicateItems.length == 1) {
                        newLoot[biome][rarity].push(item);
                        continue;
                    };


                    let newItem = Object.assign({}, item);
                    for (const i of duplicateItems) {
                        // Check for changes in attributes
                        const attrDiffs = diff.getDiff(newItem.attributes, i.attributes, true);
                        if (attrDiffs.length > 1) {
                            for (const difference of attrDiffs) {
                                // if (["generic.attack_damage"].includes(newItem.attributes[difference.path[0]].name)) continue;
                                if (difference.path[1] === "min") newItem.attributes![difference.path[0] as number].min = Math.min(difference.val, (difference as { oldVal: number }).oldVal);
                                if (difference.path[1] === "max") newItem.attributes![difference.path[0] as number].max = Math.max(difference.val, (difference as { oldVal: number }).oldVal);
                            }
                        }

                        const enchDiffs = diff.getDiff(newItem.enchantments, i.enchantments, true);
                        if (enchDiffs.length > 1) {
                            for (const difference of enchDiffs) {
                                if (difference.path[1] === "min") newItem.enchantments![difference.path[0] as number].min = Math.min(difference.val, (difference as { oldVal: number }).oldVal);
                                if (difference.path[1] === "max") newItem.enchantments![difference.path[0] as number].max = Math.max(difference.val, (difference as { oldVal: number }).oldVal);
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
        if (file.includes("common")) return "common";
        if (file.includes("rare")) return "rare"
        if (file.includes("epic")) return "epic";
        if (file.includes("legendary")) return "legendary";
        return "legendary";
    }
}