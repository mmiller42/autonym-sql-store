import {
  SORT_REGEXP,
  applyFilters,
  checkForUnrecognizedProperties,
  mapKeysDeep,
  parseIds,
  parseSearch,
  parseSort,
  transformError,
} from './utils'
import { camelCase, defaultsDeep, get, isPlainObject, snakeCase } from 'lodash'
import createBookshelf from 'bookshelf'
import createKnex from 'knex'

export default function createSqlStoreCreator(dbConfig) {
  const bookshelf = createBookshelf(createKnex(dbConfig))
  bookshelf.plugin('pagination')

  return function createSqlStore(config) {
    const {
      table,
      searchableProperties,
      sort,
      limit,
      serializeProperty,
      serialize,
      unserialize,
      bsModelOptions,
    } = normalizeConfig(config)
    const BsModel = bookshelf.Model.extend({ tableName: table, ...bsModelOptions })

    return {
      create: async data => {
        try {
          const result = await BsModel.forge(data).save(null, { method: 'insert' })
          return result.toJSON()
        } catch (err) {
          throw transformError(err)
        }
      },
      find: async (query, meta) => {
        try {
          const normalizedQuery = normalizeQuery(query, { searchableProperties, sort, limit })

          const bsModel = applyFilters(
            BsModel,
            [...get(meta, 'filters', []), ...normalizedQuery.search, ...normalizedQuery.ids],
            { serializeProperty }
          ).query('orderBy', serializeProperty(normalizedQuery.sort.property), normalizedQuery.sort.direction)

          let results = null
          if (limit) {
            results = await bsModel.fetchPage({
              limit: normalizedQuery.limit,
              offset: normalizedQuery.offset,
              ...get(meta, 'bsMethodOptions', {}),
            })
          } else {
            results = await bsModel.fetchAll(get(meta, 'bsMethodOptions', {}))
          }

          return results.toJSON()
        } catch (err) {
          throw transformError(err)
        }
      },
      findOne: async (id, meta = {}) => {
        try {
          const bsModel = applyFilters(
            new BsModel(),
            [...get(meta, 'filters', []), ['where', serializeProperty('id'), '=', id]],
            {
              serializeProperty,
            }
          )

          const result = await bsModel.fetch({ require: true, ...get(meta, 'bsMethodOptions', {}) })
          return result.toJSON()
        } catch (err) {
          throw transformError(err)
        }
      },
      findOneAndUpdate: async (id, data, completeData, meta = {}) => {
        try {
          const bsModel = applyFilters(
            new BsModel(),
            [...get(meta, 'filters', []), ['where', serializeProperty('id'), '=', id]],
            {
              serializeProperty,
            }
          )

          await bsModel.save(data, {
            method: 'update',
            patch: true,
            require: true,
            ...get(meta, 'bsMethodOptions', {}),
          })

          const result = await new BsModel({ id }).fetch({ require: true, ...get(meta, 'bsMethodOptions', {}) })
          return result.toJSON()
        } catch (err) {
          throw transformError(err)
        }
      },
      findOneAndDelete: async (id, meta = {}) => {
        try {
          const bsModel = applyFilters(
            new BsModel(),
            [...get(meta, 'filters', []), ['where', serializeProperty('id'), '=', id]],
            {
              serializeProperty,
            }
          )

          const result = await bsModel.destroy({ require: true, ...get(meta, 'bsMethodOptions', {}) })
          return result.toJSON()
        } catch (err) {
          throw transformError(err)
        }
      },
      serialize,
      unserialize,
    }
  }
}

function normalizeConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError('config parameter must be a plain object.')
  }
  if (typeof config.table !== 'string' || config.table.length === 0) {
    throw new TypeError('config.table parameter must be a non-empty string.')
  }
  if (!Array.isArray(config.searchableProperties)) {
    throw new TypeError('config.searchableProperties must be an array.')
  }
  config.searchableProperties.forEach((property, i) => {
    if (typeof property !== 'string' || property.length === 0) {
      throw new TypeError(`config.searchableProperties[${i}] must be a non-empty string.`)
    }
  })
  if (config.sort !== undefined && (typeof config.sort !== 'string' || !SORT_REGEXP.test(config.sort))) {
    throw new TypeError('config.sort must be a string matching ^[+-]\\S+$ or undefined.')
  }
  if (
    config.limit !== undefined &&
    (typeof config.limit !== 'number' ||
      config.limit < 1 ||
      !(Number.isInteger(config.limit) || config.limit === Infinity))
  ) {
    throw new TypeError('config.limit must be a positive integer, Infinity, or undefined.')
  }
  if (config.serializeProperty !== undefined && typeof config.serializeProperty !== 'function') {
    throw new TypeError('config.serializeProperty must be a function or undefined.')
  }
  if (config.unserializeColumn !== undefined && typeof config.unserializeColumn !== 'function') {
    throw new TypeError('config.unserializeColumn must be a function or undefined.')
  }
  if (config.serialize !== undefined && typeof config.serialize !== 'function') {
    throw new TypeError('config.serialize must be a function or undefined.')
  }
  if (config.unserialize !== undefined && typeof config.unserialize !== 'function') {
    throw new TypeError('config.unserialize must be a function or undefined.')
  }
  if (config.bsModelOptions !== undefined && !isPlainObject(config.bsModelOptions)) {
    throw new TypeError('config.bsModelOptions must be a plain object or undefined.')
  }

  checkForUnrecognizedProperties('config', config, [
    'table',
    'searchableProperties',
    'sort',
    'limit',
    'serializeProperty',
    'unserializeColumn',
    'serialize',
    'unserialize',
    'bsModelOptions',
  ])

  const normalizedConfig = defaultsDeep({}, config, {
    sort: '+id',
    serializeProperty: snakeCase,
    unserializeColumn: camelCase,
    serialize: data => mapKeysDeep(data, normalizedConfig.serializeProperty),
    unserialize: data => mapKeysDeep(data, normalizedConfig.unserializeColumn),
    bsModelOptions: {},
  })

  if (!normalizedConfig.limit || normalizedConfig.limit === Infinity) {
    normalizedConfig.limit = null
  }

  return normalizedConfig
}

function normalizeQuery(query = {}, { searchableProperties, sort, limit: defaultLimit }) {
  const limit = parseInt(query.limit, 10)
  const offset = parseInt(query.offset, 10)

  return {
    search: parseSearch(query.search, { searchableProperties }),
    sort: parseSort(query.sort) || parseSort(sort),
    limit: limit > 0 && Number.isInteger(limit) && (!defaultLimit || limit <= defaultLimit) ? limit : defaultLimit,
    offset: offset >= 0 && Number.isInteger(offset) ? offset : 0,
    ids: parseIds(query.ids),
  }
}
