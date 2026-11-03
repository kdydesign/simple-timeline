import type {DatabaseHandle} from './repository'
import {createSchema} from './schema'
export interface Migration {version:number;up(db:DatabaseHandle):void}
export const migrations:Migration[]=[{version:1,up:createSchema}]
