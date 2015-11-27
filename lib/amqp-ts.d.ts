// exported Typescript type definition for AmqpSimple

import * as Promise from "bluebird";

export declare namespace Connection {
    interface ReconnectStrategy {
        retries: number;
        interval: number;
    }
    export interface Topology {
        exchanges?: {
            name: string,
            type?: string,
            options?: any
        }[];
        queues?: {
            name: string,
            options?: any
        }[];
        bindings?: {
            source: string,
            queue?: string,
            exchange?: string,
            pattern?: string,
            args?: any
        }[];
    }
}
export class Connection {
    initialized: Promise<void>;

    constructor(url?: string, socketOptions?: any, reconnectStrategy?: Connection.ReconnectStrategy);
    private rebuildConnection();
    private tryToConnect(retry, callback);
    close(): Promise<void>;
    /**
      * Make sure the whole defined connection topology is configured:
      * return promise that fulfills after all defined exchanges, queues and bindings are initialized
      */
    completeConfiguration(): Promise<void>;
    /**
      * Delete the whole defined connection topology:
      * return promise that fulfills after all defined exchanges, queues and bindings have been removed
      */
    deleteConfiguration(): Promise<void>;
    declareExchange(name: string, type?: string, options?: Exchange.DeclarationOptions): Exchange;
    declareQueue(name: string, options?: Queue.DeclarationOptions): Queue;
    declareTopology(topology: Connection.Topology): Promise<void>;
}
export class Message {
  content: Buffer;
  fields: any;
  properties: any;

  constructor (content?: any, options?: any);
  setContent(content: any);
  getContent(): any;
  sendTo(destination: Exchange | Queue, routingKey?: string);
  ack(allUpTo?: boolean);
  nack(requeue?: boolean);
  reject(requeue?: boolean);
}
export declare namespace Exchange {
    interface DeclarationOptions {
        durable?: boolean;
        internal?: boolean;
        autoDelete?: boolean;
        alternateExchange?: string;
        arguments?: any;
    }
    export interface InitializeResult {
        exchange: string;
    }
}
export class Exchange {
    initialized: Promise<Exchange.InitializeResult>;

    constructor(connection: Connection, name: string, type?: string, options?: Exchange.DeclarationOptions);
    /**
     * deprecated! use 'exchange.send(msg: Message, routingKey: string)' instead, will be removed in a next major release!
     */
    publish(content: any, routingKey?: string, options?: any): void;
    send(message: Message, routingKey?: string): void;
    rpc(requestParameters: any): Promise<Message>;
    delete(): Promise<void>;
    close(): Promise<void>;
    bind(source: Exchange, pattern?: string, args?: any): Promise<void>;
    unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
    consumerQueueName(): string;
    /**
     * deprecated! use 'exchange.activateConsumer(...)' instead, will be removed in a next major release!
     */
    startConsumer(onMessage: (msg: any, channel?: any) => any, options?: Queue.StartConsumerOptions): Promise<void>;
    activateConsumer(onMessage: (message: Message) => any, options?: Queue.StartConsumerOptions): Promise<void>;
    stopConsumer(): Promise<void>;
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
    }
    interface ActivateConsumerOptions {
        consumerTag?: string;
        noLocal?: boolean;
        noAck?: boolean;
        exclusive?: boolean;
        priority?: number;
        arguments?: Object;
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
export class Queue {
    initialized: Promise<Queue.InitializeResult>;

    constructor(connection: Connection, name: string, options?: Queue.DeclarationOptions);
    /**
     * deprecated! use 'exchange.send(msg: Message, routingKey: string)' instead, will be removed in a next major release!
     */
    publish(content: any, options?: any): void;
    send(message: Message, routingKey?: string): void;
    rpc(requestParameters: any): Promise<Message>;
    /**
     * deprecated! use 'queue.activateConsumer(...)' instead, will be removed in a next major release!
     */
    startConsumer(onMessage: (msg: any, channel?: any) => any, options?: Queue.StartConsumerOptions): Promise<Queue.StartConsumerResult>;
    activateConsumer(onMessage: (message: Message) => any, options?: Queue.StartConsumerOptions): Promise<void>;
    stopConsumer(): Promise<void>;
    delete(): Promise<Queue.DeleteResult>;
    close(): Promise<Queue.DeleteResult>;
    bind(source: Exchange, pattern?: string, args?: any): Promise<void>;
    unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
}

/**
 * winston Logger instance
 */
export var log;
