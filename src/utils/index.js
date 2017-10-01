import { difference, isPlainObject, reduce } from 'lodash'

export const SORT_REGEXP = /^([+-])(\S+)$/

export function checkForUnrecognizedProperties(parameterName, object, expectedProperties) {
  if (!object) {
    return
  }

  const invalidKeys = difference(Object.keys(object), expectedProperties)
  if (invalidKeys.length !== 0) {
    throw new TypeError(`Unexpected properties on ${parameterName} parameter: "${invalidKeys.join('", "')}".`)
  }
}

export function mapKeysDeep(object, iterator) {
  if (!isPlainObject(object)) {
    return object
  }

  return reduce(
    object,
    (result, value, key) => {
      if (Array.isArray(value)) {
        result[iterator(key)] = value.map(v => mapKeysDeep(v, iterator))
      } else {
        result[iterator(key)] = mapKeysDeep(value, iterator)
      }
      return result
    },
    {}
  )
}

export function parseSearch(search, { searchableProperties }) {
  if (!isPlainObject(search)) {
    return {}
  }

  return reduce(
    search,
    (filters, query, property) => {
      if (searchableProperties.includes(property)) {
        let operator = '='
        let value = query
        if (isPlainObject(query)) {
          ;[operator] = Object.keys(query)
          value = query[operator]
        }

        if (['=', '!=', '~', '!~'].contains(operator)) {
          if (['~', '!~'].contains(operator)) {
            value = `%${value}%`
          }
          filters.push('where', property, operator, value === 'NULL' ? null : value)
        }
      }
      return filters
    },
    []
  )
}

export function parseSort(sortQuery) {
  if (typeof sortQuery !== 'string') {
    return null
  }

  const match = sortQuery.match(SORT_REGEXP)
  if (match) {
    const [, direction, property] = match
    return { direction: direction === '+' ? 'ASC' : 'DESC', property }
  }

  return null
}

export function parseIds(ids) {
  if (Array.isArray(ids)) {
    const idsToFilter = ids.filter(id => typeof id === 'string' && id.length > 0)
    if (idsToFilter.length > 0) {
      return [['whereIn', 'id', idsToFilter]]
    }
  }
  return []
}

export function applyFilters(bsModel, filters = [], { serializeProperty }) {
  if (!Array.isArray(filters)) {
    return bsModel
  }

  return filters.reduce((instance, filterArgs) => {
    const [clause, property, ...restArgs] = filterArgs
    return instance.query(clause, serializeProperty(property), ...restArgs)
  }, bsModel)
}
