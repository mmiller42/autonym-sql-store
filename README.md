# autonym-sql-store

Store constructor for [Autonym](https://github.com/mmiller42/autonym) models, powered by [Bookshelf.js](http://bookshelfjs.org/).

## Installation

Install this module as well as the driver for whichever SQL store you intend to use, i.e. one of the following:

* [`pg`](https://github.com/brianc/node-postgres)
* [`sqlite3`](https://github.com/mapbox/node-sqlite3)
* [`mysql`](https://github.com/mysqljs/mysql)
* [`mysql2`](https://github.com/sidorares/node-mysql2)
* [`mariasql`](https://github.com/mscdex/node-mariasql)
* [`strong-oracle`](https://github.com/strongloop/strong-oracle)
* [`oracle`](https://github.com/joeferner/node-oracle)
* [`mssql`](https://github.com/patriksimek/node-mssql)

```bash
npm install autonym-sql-store pg
```

## Usage

The module exports a function that should be called only once per database, not per model. So if you have multiple models that use the same SQL database, you should create a file that calls this function and exports the result. You can see an example of this by referencing the `sql-store` example in the [`autonym-examples`](https://github.com/mmiller42/autonym-examples) repository: in particular, [`src/stores/createSqlStore.js`](https://github.com/mmiller42/autonym-examples/blob/master/sql-store/src/stores/createSqlStore.js) and its usage in [`src/models/Person.js`](https://github.com/mmiller42/autonym-examples/blob/master/sql-store/src/models/Person.js).

First, import the module.

```js
import createSqlStoreCreator from 'autonym-sql-store'
```

Then, instantiate a connection to your SQL database by calling the function.

```js
const createSqlStore = createSqlStoreCreator({
  client: 'pg',
  connection: process.env.DATABASE_URL,
})
```

The arguments passed to this function are the same as those passed to [Knex](http://knexjs.org/#Installation-client).

The value returned from `createSqlStoreCreator` is a function, which should be called for each model. The parameters are documented in the [API](#api) section.

The value returned from *that* function is a store API with `create`, `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `serialize`, and `unserialize` methods.

```js
import { Model } from 'autonym'
import { createSqlStore } from '../stores'

export default new Model({
  // ...
  store: createSqlStore({
    table: 'people',
  }),
})
```

## API

The result of `createSqlStoreCreator` is a function which accepts a configuration object with the following properties.

| Property               | Type                | Description                                                                                                                                                                                           | Default                                                         |
| :----------------------| :------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| `table`                | string              | The name of the database table.                                                                                                                                                                       | *None*                                                          |
| `searchableProperties` | array&lt;string&gt; | Which properties in your schema the user should be able to filter and sort by.                                                                                                                        | `[]`                                                            |
| `sort`                 | string              | The default sorting of rows. The first character should be `+` for ascending or `-` for descending, followed by the property to sort by. The property must be in the array of `searchableProperties`. | `+id`                                                           |
| `limit`                | number              | The maximum number of rows to return in a paginated set. This is the default number of rows to fetch per page, but the user may request fewer.                                                        | `Infinity`                                                      |
| `serializeProperty`    | function            | A function that accepts a property name and must return the corresponding column name in the table.                                                                                                   | `_.snakeCase`                                                   |
| `unserializeColumn`    | function            | A function that accepts a column name and must return the corresponding property name for the model.                                                                                                  | `_.camelCase`                                                   |
| `serialize`            | function            | A function that accepts a model record and must return an object whose keys are column names and whose values are the data to save in the database.                                                   | Maps over the object, calling `serializeProperty` on each key   |
| `unserialize`          | function            | A function that accepts a row object and must return an object whose keys are model property names and whose values are the data to return in the API.                                                | Maps over the object, calling `unserializeColumn` on each value |
| `bsModelOptions`       | object              | Additional properties to pass to the Bookshelf instance.                                                                                                                                              | `{}`                                                            |

## Find Requests

Find requests can leverage features specific to this store module by adding information to the query string.

* `?search[firstName]=John` filters to resources whose `firstName` property is equal to `John`.
* `?search[firstName][!=]=John` filters to resources whose `firstName` property is *not* equal to `John`.
* `?search[firstName][~]=j` filters to resources whose `firstName` property contains the string `j` (case-insensitive).
* `?search[firstName][!~]=j` filters to resources whose `firstName` property does *not* contain the string `j` (case-insensitive).
* `?sort=+firstName` sorts resources by the `firstName` property, ascending.
* `?limit=10&offset=20` fetches up to 10 resources, starting at the 20th resource.
* `?ids[]=1&ids[]=2` fetches the resources with ids `1` and `2`.

## Meta

Specific properties on the `meta` object that is passed to the store methods can affect the behavior. You can use these properties to restrict and change queries.

| Property          | Type                          | Description                                                                                                                                                                                                                                                                              |
| :---------------- | :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filters`         | array&lt;array&lt;any&gt;&gt; | An array of arrays. In each sub-array, the first element is the name of a [query method](http://knexjs.org/#Builder-where), and the remaining elements are arguments to pass to it. For example, `[['where', 'name', '=', 'test']]` would add a where condition to the query to execute. |
| `bsMethodOptions` | object                        | Additional parameters to pass to the Bookshelf model function.                                                                                                                                                                                                                           |
