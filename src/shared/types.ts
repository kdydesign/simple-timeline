export type Id=string
export type BusinessDate=string
export interface YearMonth {year:number;month:number}
export interface Project {id:Id;name:string;color:string;participants:string[];createdAt:string;updatedAt:string}
export interface Schedule {id:Id;projectId:Id;name:string;startDate:BusinessDate;endDate:BusinessDate;createdAt:string;updatedAt:string}
export interface TimelineSnapshot {projects:Project[];schedules:Schedule[]}
export type ErrorCode='VALIDATION_ERROR'|'NOT_FOUND'|'FORBIDDEN'|'DB_NOT_READY'|'DB_BUSY'|'STORAGE_FULL'|'STORAGE_IO'|'DB_CORRUPT'|'SCHEMA_TOO_NEW'|'IPC_UNAVAILABLE'|'INTERNAL_ERROR'
export interface ApiError {code:ErrorCode;message:string;field?:string}
export type Result<T>={ok:true;data:T}|{ok:false;error:ApiError}
export type ProjectInput=Pick<Project,'name'|'color'|'participants'>
export type ScheduleInput=Pick<Schedule,'projectId'|'name'|'startDate'|'endDate'>
export type ScheduleUpdate=Omit<ScheduleInput,'projectId'>&{id:Id}
