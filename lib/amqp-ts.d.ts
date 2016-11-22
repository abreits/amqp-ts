// exported Typescript type definition for AmqpSimple

import * as Promise from "bluebird";

export declare class Connection {
    initialized: Promise<void>;
    constructor(url?: string, socketOptions?: any, reconnectStrategy?: Connection.ReconnectStrategy);

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
}
export declare namespace Connection {
    interface ReconnectStrategy {
        retries: number;
        interval: number;
    }
    export interface Topology {
        exchanges?: {
            name: string;
            type?: string;
            options?: any;
        }[];
        queues?: {
            name: string;
            options?: any;
        }[];
        bindings?: {
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

    constructor(content?: any, options?: any);
    setContent(content: any): void;
    getContent(): any;
    sendTo(destination: Exchange | Queue, routingKey?: string): void;
    ack(allUpTo?: boolean): void;
    nack(allUpTo?: boolean, requeue?: boolean): void;
    reject(requeue?: boolean): void;
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
    export interface InitializeResult {
        exchange: string;
    }
}

export declare class Exchange {
    initialized: Promise<Exchange.InitializeResult>;
    name: string;
    type: string;
    constructor(connection: Connection, name: string, type?: string, options?: Exchange.DeclarationOptions);
    /**
     * deprecated, use 'exchange.send(message: Message)' instead
     */
    publish(content: any, options?: any): void;
    send(message: Message, routingKey?: string): void;

    rpc(requestParameters: any, routingKey?: string): Promise<Message>;
    delete(): Promise<void>;
    close(): Promise<void>;
    bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>;
    unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
    consumerQueueName(): string;
    /**
     * deprecated, use 'exchange.activateConsumer(...)' instead
     */
    startConsumer(onMessage: (msg: any, channel?: any) => any, options?: Queue.StartConsumerOptions): Promise<any>;
    activateConsumer(onMessage: (msg: Message) => any, options?: Queue.ActivateConsumerOptions): Promise<any>;
    stopConsumer(): Promise<any>;
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
        exclusive?: boolean;
        priority?: number;
        arguments?: Object;
    }
    interface ActivateConsumerOptions {
        consumerTag?: string;
        noLocal?: boolean;
        noAck?: boolean;
        exclusive?: boolean;
        priority?: number;
        arguments?: Object;
    }
    interface StartConsumerResult {
        consumerTag: string;
    }
    export interface InitializeResult {
        queue: string;
        messageCount: number;
        consumerCount: number;
    }
    interface DeleteResult {
        messageCount: number;
    }
}

export declare class Queue {
    initialized: Promise<Queue.InitializeResult>;
    name: string;

    constructor(connection: Connection, name: string, options?: Queue.DeclarationOptions);
    /**
     * deprecated, use 'queue.send(message: Message)' instead
     */
    publish(content: any, options?: any): void;
    send(message: Message, routingKey?: string): void;
    rpc(requestParameters: any): Promise<Message>;
    /**
     * deprecated, use 'queue.activateConsumer(...)' instead
     */
    startConsumer(onMessage: (msg: any, channel?: any) => any, options?: Queue.StartConsumerOptions): Promise<Queue.StartConsumerResult>;
    activateConsumer(onMessage: (msg: Message) => any, options?: Queue.ActivateConsumerOptions): Promise<Queue.StartConsumerResult>;
    stopConsumer(): Promise<void>;
    delete(): Promise<Queue.DeleteResult>;
    close(): Promise<void>;
    bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>;
    unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
    prefetch(count: number): void;
    recover(): Promise<void>;
}

export declare class Binding {
    initialized: Promise<Binding>;

    constructor(destination: Exchange | Queue, source: Exchange, pattern?: string, args?: any);
    delete(): Promise<void>;
    static id(destination: Exchange | Queue, source: Exchange, pattern?: string): string;
    static removeBindingsContaining(connectionPoint: Exchange | Queue): Promise<any>;
}
/**
 * winston Logger instance
 */
export declare var log: any;
