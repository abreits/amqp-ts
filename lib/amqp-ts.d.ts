/**
 * AmqpSimple.ts - provides a simple interface to read from and write to RabbitMQ amqp exchanges
 * Created by Ab on 17-9-2015.
 *
 * methods and properties starting with '_' signify that the scope of the item should be limited to
 * the inside of the enclosing namespace.
 */
/// <reference types="node" />
import * as AmqpLib from "amqplib/callback_api";
import * as Promise from "bluebird";
import * as winston from "winston";
import { EventEmitter } from "events";
export declare var log: winston.LoggerInstance;
export declare class Connection extends EventEmitter {
    initialized: Promise<void>;
    private url;
    private socketOptions;
    private reconnectStrategy;
    private connectedBefore;
    _connection: AmqpLib.Connection;
    _retry: number;
    _rebuilding: boolean;
    _isClosing: boolean;
    isConnected: boolean;
    _exchanges: {
        [id: string]: Exchange;
    };
    _queues: {
        [id: string]: Queue;
    };
    _bindings: {
        [id: string]: Binding;
    };
    constructor(url?: string, socketOptions?: any, reconnectStrategy?: Connection.ReconnectStrategy);
    private rebuildConnection;
    private tryToConnect;
    _rebuildAll(err: Error): Promise<void>;
    close(): Promise<void>;
    /**
     * Make sure the whole defined connection topology is configured:
     * return promise that fulfills after all defined exchanges, queues and bindings are initialized
     */
    completeConfiguration(): Promise<any>;
    /**
     * Delete the whole defined connection topology:
     * return promise that fulfills after all defined exchanges, queues and bindings have been removed
     */
    deleteConfiguration(): Promise<any>;
    declareExchange(name: string, type?: string, options?: Exchange.DeclarationOptions): Exchange;
    declareQueue(name: string, options?: Queue.DeclarationOptions): Queue;
    declareTopology(topology: Connection.Topology): Promise<any>;
    readonly getConnection: AmqpLib.Connection;
}
export declare namespace Connection {
    interface ReconnectStrategy {
        retries: number;
        interval: number;
    }
    interface Topology {
        exchanges: {
            name: string;
            type?: string;
            options?: any;
        }[];
        queues: {
            name: string;
            options?: any;
        }[];
        bindings: {
            source: string;
            queue?: string;
            exchange?: string;
            pattern?: string;
            args?: any;
        }[];
    }
}
export declare class Message {
    content: Buffer;
    fields: any;
    properties: any;
    _channel: AmqpLib.Channel;
    _message: AmqpLib.Message;
    constructor(content?: any, options?: any);
    setContent(content: any): void;
    getContent(): any;
    sendTo(destination: Exchange | Queue, routingKey?: string): void;
    ack(allUpTo?: boolean): void;
    nack(allUpTo?: boolean, requeue?: boolean): void;
    reject(requeue?: boolean): void;
}
export declare class Exchange {
    initialized: Promise<Exchange.InitializeResult>;
    _consumer_handlers: Array<[string, any]>;
    _isConsumerInitializedRcp: boolean;
    _connection: Connection;
    _channel: AmqpLib.Channel;
    _name: string;
    _type: string;
    _options: Exchange.DeclarationOptions;
    _deleting: Promise<void>;
    _closing: Promise<void>;
    readonly name: string;
    readonly type: string;
    constructor(connection: Connection, name: string, type?: string, options?: Exchange.DeclarationOptions);
    _initialize(): void;
    /**
     * deprecated, use 'exchange.send(message: Message, routingKey?: string)' instead
     */
    publish(content: any, routingKey?: string, options?: any): void;
    send(message: Message, routingKey?: string): void;
    rpc(requestParameters: any, routingKey?: string, callback?: (err: any, message: Message) => void): Promise<Message>;
    delete(): Promise<void>;
    close(): Promise<void>;
    bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>;
    unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
    consumerQueueName(): string;
    /**
     * deprecated, use 'exchange.activateConsumer(...)' instead
     */
    startConsumer(onMessage: (msg: any, channel?: AmqpLib.Channel) => any, options?: Queue.StartConsumerOptions): Promise<any>;
    activateConsumer(onMessage: (msg: Message) => any, options?: Queue.ActivateConsumerOptions): Promise<any>;
    stopConsumer(): Promise<any>;
}
export declare namespace Exchange {
    interface DeclarationOptions {
        durable?: boolean;
        internal?: boolean;
        autoDelete?: boolean;
        alternateExchange?: string;
        arguments?: any;
        noCreate?: boolean;
    }
    interface InitializeResult {
        exchange: string;
    }
}
export declare class Queue {
    initialized: Promise<Queue.InitializeResult>;
    _connection: Connection;
    _channel: AmqpLib.Channel;
    _name: string;
    _options: Queue.DeclarationOptions;
    _consumer: (msg: any, channel?: AmqpLib.Channel) => any;
    _isStartConsumer: boolean;
    _rawConsumer: boolean;
    _consumerOptions: Queue.StartConsumerOptions;
    _consumerTag: string;
    _consumerInitialized: Promise<Queue.StartConsumerResult>;
    _consumerStopping: boolean;
    _deleting: Promise<Queue.DeleteResult>;
    _closing: Promise<void>;
    readonly name: string;
    constructor(connection: Connection, name: string, options?: Queue.DeclarationOptions);
    _initialize(): void;
    static _packMessageContent(content: any, options: any): Buffer;
    static _unpackMessageContent(msg: AmqpLib.Message): any;
    /**
     * deprecated, use 'queue.send(message: Message)' instead
     */
    publish(content: any, options?: any): void;
    send(message: Message): void;
    rpc(requestParameters: any): Promise<Message>;
    prefetch(count: number): void;
    recover(): Promise<void>;
    /**
     * deprecated, use 'queue.activateConsumer(...)' instead
     */
    startConsumer(onMessage: (msg: any, channel?: AmqpLib.Channel) => any, options?: Queue.StartConsumerOptions): Promise<Queue.StartConsumerResult>;
    activateConsumer(onMessage: (msg: Message) => any, options?: Queue.ActivateConsumerOptions): Promise<Queue.StartConsumerResult>;
    _initializeConsumer(): void;
    stopConsumer(): Promise<void>;
    delete(): Promise<Queue.DeleteResult>;
    close(): Promise<void>;
    bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>;
    unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
}
export declare namespace Queue {
    interface DeclarationOptions {
        exclusive?: boolean;
        durable?: boolean;
        autoDelete?: boolean;
        arguments?: any;
        messageTtl?: number;
        expires?: number;
        deadLetterExchange?: string;
        maxLength?: number;
        prefetch?: number;
        noCreate?: boolean;
    }
    interface StartConsumerOptions {
        rawMessage?: boolean;
        consumerTag?: string;
        noLocal?: boolean;
        noAck?: boolean;
        manualAck?: boolean;
        exclusive?: boolean;
        priority?: number;
        arguments?: Object;
    }
    interface ActivateConsumerOptions {
        consumerTag?: string;
        noLocal?: boolean;
        noAck?: boolean;
        manualAck?: boolean;
        exclusive?: boolean;
        priority?: number;
        arguments?: Object;
    }
    interface StartConsumerResult {
        consumerTag: string;
    }
    interface InitializeResult {
        queue: string;
        messageCount: number;
        consumerCount: number;
    }
    interface DeleteResult {
        messageCount: number;
    }
}
export declare class Binding {
    initialized: Promise<Binding>;
    _source: Exchange;
    _destination: Exchange | Queue;
    _pattern: string;
    _args: any;
    constructor(destination: Exchange | Queue, source: Exchange, pattern?: string, args?: any);
    _initialize(): void;
    delete(): Promise<void>;
    static id(destination: Exchange | Queue, source: Exchange, pattern?: string): string;
    static removeBindingsContaining(connectionPoint: Exchange | Queue): Promise<any>;
}
