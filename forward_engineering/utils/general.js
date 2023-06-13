const {TableOptionsByEngine, TableOptions} = require("../enums/tableOptions");

module.exports = ({_, wrap}) => {
    const getTableName = (tableName, schemaName) => {
        if (schemaName) {
            return `\`${schemaName}\`.\`${tableName}\``;
        } else {
            return `\`${tableName}\``;
        }
    };

    const getOptionValue = (keyword, value) => {
        if (['ROW_FORMAT', 'INSERT_METHOD'].includes(keyword)) {
            if (value) {
                return _.toUpper(value);
            } else {
                return;
            }
        }

        if (keyword === 'UNION') {
            return value;
        }

        if (['YES', 'NO', 'DEFAULT'].includes(_.toUpper(value))) {
            return _.toUpper(value);
        }
        if (typeof value === 'number') {
            return value;
        } else if (!isNaN(+value) && value) {
            return +value;
        } else if (typeof value === 'string' && value) {
            return wrap(value);
        } else if (typeof value === 'boolean') {
            return value ? 'YES' : 'NO';
        }
    };

    const encodeStringLiteral = (str = '') => {
        return str.replace(/(?<!\\)('|"|`)/gi, '\\$1').replace(/\n/gi, '\\n');
    }

    const getTableOptions = (options = {}) => {
        const tableOptions = [];
        const engine = options.ENGINE;

        if (!options.defaultCharSet) {
            if (options.characterSet) {
                tableOptions.push(`CHARSET=${options.characterSet}`);
            }
            if (options.collation) {
                tableOptions.push(`COLLATE=${options.collation}`);
            }
        }

        if (engine) {
            tableOptions.push(`ENGINE = ${engine}`);
        }

        if (options.description) {
            tableOptions.push(`COMMENT = '${encodeStringLiteral(options.description)}'`);
        }

        const optionKeywords = TableOptionsByEngine[engine] || ['KEY_BLOCK_SIZE', 'PACK_KEYS', 'WITH_SYSTEM_VERSIONING'];

        optionKeywords.forEach(keyword => {
            if (keyword === 'WITH_SYSTEM_VERSIONING') {
                if (options[keyword]) {
                    return tableOptions.push(TableOptions[keyword]);
                } else {
                    return;
                }
            }

            const value = getOptionValue(keyword, options[keyword]);

            if (value === undefined) {
                return;
            }

            const option = `${TableOptions[keyword]} = ${value}`;

            tableOptions.push(option);
        });

        if (!tableOptions.length) {
            return '';
        }

        return ' ' + tableOptions.join(',\n\t');
    };

    const addLinear = linear => (linear ? 'LINEAR ' : '');

    const getPartitionBy = partitioning => {
        if (partitioning.partitionType === 'SYSTEM_TIME') {
            let interval =
                !isNaN(partitioning.interval) && partitioning.interval ? ` INTERVAL ${partitioning.interval}` : '';

            if (interval && partitioning.time_unit) {
                interval += ` ${partitioning.time_unit}`;
            }

            return `SYSTEM_TIME${interval}`;
        }

        return `${addLinear(partitioning.LINEAR)}${partitioning.partitionType}(${_.trim(
            partitioning.partitioning_expression,
        )})`;
    };

    const getSubPartitionBy = partitioning => {
        if (!partitioning.subpartitionType) {
            return '';
        }

        return `SUBPARTITION BY ${addLinear(partitioning.SUBLINEAR)}${partitioning.subpartitionType}(${_.trim(
            partitioning.subpartitioning_expression,
        )})`;
    };

    const getPartitionDefinitions = partitioning => {
        if (!Array.isArray(partitioning.partition_definitions)) {
            return '';
        }

        const partitions = partitioning.partition_definitions
            .filter(({ partitionDefinition }) => partitionDefinition)
            .map(partitionDefinition => {
                const subPartitionDefinitions = partitionDefinition.subpartitionDefinition;

                if (subPartitionDefinitions) {
                    return partitionDefinition.partitionDefinition + ' ' + wrap(subPartitionDefinitions, '(', ')');
                } else {
                    return partitionDefinition.partitionDefinition;
                }
            })
            .join(',\n\t\t');

        if (!partitions) {
            return '';
        }

        return wrap('\n\t\t' + partitions + '\n\t', '(', ')');
    };

    const getPartitions = (partitioning = {}) => {
        if (!partitioning.partitionType) {
            return '';
        }

        const partitionBy = `PARTITION BY ${getPartitionBy(partitioning)}`;
        const partitions = partitioning.partitions ? `PARTITIONS ${partitioning.partitions}` : '';
        const subPartitionBy = getSubPartitionBy(partitioning);
        const subPartitions = partitioning.subpartitions ? `SUBPARTITIONS ${partitioning.subpartitions}` : '';
        const partitionDefinitions = getPartitionDefinitions(partitioning);

        const result = [partitionBy, partitions, subPartitionBy, subPartitions, partitionDefinitions].filter(Boolean);

        if (!result.length) {
            return '';
        }

        return '\n\t' + result.join('\n\t');
    };

    const getKeyWithAlias = key => {
        if (!key) {
            return '';
        }

        if (key.alias) {
            return `\`${key.name}\` as \`${key.alias}\``;
        } else {
            return `\`${key.name}\``;
        }
    };

    const getViewData = keys => {
        if (!Array.isArray(keys)) {
            return { tables: [], columns: [] };
        }

        return keys.reduce(
            (result, key) => {
                if (!key.tableName) {
                    result.columns.push(getKeyWithAlias(key));

                    return result;
                }

                let tableName = `\`${key.tableName}\``;

                if (!result.tables.includes(tableName)) {
                    result.tables.push(tableName);
                }

                result.columns.push({
                    statement: `${tableName}.${getKeyWithAlias(key)}`,
                    isActivated: key.isActivated,
                });

                return result;
            },
            {
                tables: [],
                columns: [],
            },
        );
    };

    const getCharacteristics = udfCharacteristics => {
        const characteristics = [];

        if (udfCharacteristics.language) {
            characteristics.push('LANGUAGE SQL');
        }

        if (udfCharacteristics.deterministic) {
            characteristics.push(udfCharacteristics.deterministic);
        }

        if (udfCharacteristics.sqlSecurity) {
            characteristics.push(`SQL SECURITY ${udfCharacteristics.sqlSecurity}`);
        }

        if (udfCharacteristics.comment) {
            characteristics.push(`COMMENT ${wrap(escapeQuotes(udfCharacteristics.comment))}`);
        }

        return characteristics;
    };

    const escapeQuotes = (str = '') => {
        return str.replace(/(')/gi, "'$1").replace(/\n/gi, '\\n');
    };

    return {
        getTableName,
        getTableOptions,
        getPartitions,
        getViewData,
        getCharacteristics,
        escapeQuotes,
    };
}
