import {
  SORT_REGEXP,
  applyFilters,
  checkForUnrecognizedProperties,
  mapKeysDeep,
  parseIds,
  parseSearch,
  parseSort,
} from './utils'
import { camelCase, defaultsDeep, isPlainObject, snakeCase } from 'lodash'
import createBookshelf from 'bookshelf'
import createKnex from 'knex'

export default function createSqlStoreCreator(dbConfig) {
  const bookshelf = createBookshelf(createKnex(dbConfig))
  return function createSqlStore(config) {
    const {
      table,
      searchableProperties,
      sort,
      perPage,
      serializeProperty,
      serialize,
      unserialize,
      bsModelOptions,
    } = normalizeConfig(config)
    const BsModel = bookshelf.Model.extend({ tableName: table, ...bsModelOptions })

    return {
      create: async data => {
        const result = await BsModel.forge(data).save(null, { method: 'insert' })
        return result.toJSON()
      },
      find: async (query, meta = {}) => {
        const normalizedQuery = normalizeQuery(query, { searchableProperties, sort, perPage })

        const bsModel = applyFilters(
          new BsModel(),
          [...meta.filters, ...normalizedQuery.search, ...normalizedQuery.ids],
          { serializeProperty }
        )
        bsModel.orderBy(serializeProperty(normalizedQuery.sort.property), normalizedQuery.sort.direction)

        let results = null
        if (perPage) {
          results = await bsModel.fetchPage({ limit: normalizedQuery.perPage, offset: normalizedQuery.offset })
        } else {
          results = await bsModel.fetchAll(meta.bsMethodOptions)
        }

        return results.toJSON()
      },
      findOne: async (id, meta = {}) => {
        const bsModel = applyFilters(new BsModel(), [...meta.filters, ['where', serializeProperty(id), '=', id]], {
          serializeProperty,
        })

        const result = await bsModel.fetch({ require: true, ...(meta.bsMethodOptions || {}) })
        return result.toJSON()
      },
      findOneAndUpdate: async (id, data, completeData, meta = {}) => {
        const bsModel = applyFilters(new BsModel(), [...meta.filters, ['where', serializeProperty(id), '=', id]], {
          serializeProperty,
        })

        const result = await bsModel.save(data, {
          method: 'update',
          patch: true,
          require: true,
          ...(meta.bsMethodOptions || {}),
        })
        return result.toJSON()
      },
      findOneAndDelete: async (id, meta = {}) => {
        const bsModel = applyFilters(new BsModel(), [...meta.filters, ['where', serializeProperty(id), '=', id]], {
          serializeProperty,
        })

        const result = await bsModel.destroy({ require: true, ...(meta.bsMethodOptions || {}) })
        return result.toJSON()
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
    config.perPage !== undefined &&
    (typeof config.perPage !== 'number' ||
      config.perPage < 1 ||
      !(Number.isInteger(config.perPage) || config.perPage === Infinity))
  ) {
    throw new TypeError('config.perPage must be a positive integer, Infinity, or undefined.')
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
    'perPage',
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
    bsModelOptions: {},
  })

  if (!normalizedConfig.serialize) {
    normalizedConfig.serialize = function serialize(data) {
      return mapKeysDeep(data, this.serializeProperty)
    }
  }
  if (!normalizedConfig.unserialize) {
    normalizedConfig.unserialize = function unserialize(data) {
      return mapKeysDeep(data, this.unserializeColumn)
    }
  }
  if (!normalizedConfig.perPage || normalizedConfig.perPage === Infinity) {
    normalizedConfig.perPage = null
  }

  return normalizedConfig
}

function normalizeQuery(query = {}, { searchableProperties, sort, perPage: defaultPerPage }) {
  const perPage = parseInt(query.perPage, 10)
  const offset = parseInt(query.offset, 10)

  return {
    search: parseSearch(query.search, { searchableProperties }),
    sort: parseSort(query.sort) || parseSort(sort),
    perPage: perPage > 0 && perPage <= defaultPerPage && Number.isInteger(perPage) ? perPage : defaultPerPage,
    offset: offset >= 0 && Number.isInteger(offset) ? offset : 0,
    ids: parseIds(query.ids),
  }
}
