/// <reference path="../typings_custom/amqplib_callback/amqplib_callback.d.ts" />
/**
 * AmqpSimple.ts - provides a simple interface to read from and write to RabbitMQ amqp exchanges
 * Created by Ab on 17-9-2015.
 *
 * methods and properties starting with '_' signify that the scope of the item should be limited to
 * the inside of the enclosing namespace.
 */
import * as Amqp from "amqplib/callback_api";
import * as Promise from "bluebird";
export declare namespace AmqpSimple {
    namespace Connection {
        interface ReconnectStrategy {
            retries: number;
            interval: number;
        }
    }
    class Connection {
        initialized: Promise<void>;
        private url;
        private socketOptions;
        private reconnectStrategy;
        _connection: Amqp.Connection;
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
        private rebuildConnection();
        private tryToConnect(retry, callback);
        _rebuildAll(err: any): Promise<void>;
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
    }
    namespace Exchange {
        interface DeclarationOptions {
            durable?: boolean;
            internal?: boolean;
            autoDelete?: boolean;
            alternateExchange?: string;
            arguments?: any;
        }
    }
    class Exchange {
        initialized: Promise<Exchange>;
        _connection: Connection;
        _channel: Amqp.Channel;
        _name: string;
        _type: string;
        _options: Amqp.Options.AssertExchange;
        constructor(connection: Connection, name: string, type?: string, options?: Exchange.DeclarationOptions);
        publish(content: any, routingKey?: string, options?: any): void;
        delete(): Promise<void>;
        bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>;
        unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
        consumerQueueName(): string;
        startConsumer(onMessage: (msg: any) => void, options?: Queue.StartConsumerOptions): Promise<any>;
        stopConsumer(): Promise<any>;
    }
    namespace Queue {
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
        interface StartConsumerOptions {
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
        interface DeleteResult {
            messageCount: number;
        }
    }
    class Queue {
        initialized: Promise<Queue>;
        _connection: Connection;
        _channel: Amqp.Channel;
        _name: string;
        _options: Queue.DeclarationOptions;
        _consumer: (msg: any) => void;
        _consumerOptions: Queue.StartConsumerOptions;
        _consumerTag: string;
        _consumerInitialized: Promise<Queue.StartConsumerResult>;
        constructor(connection: Connection, name: string, options?: Queue.DeclarationOptions);
        publish(content: any, options?: any): void;
        startConsumer(onMessage: (msg: any) => void, options?: Queue.StartConsumerOptions): Promise<Queue.StartConsumerResult>;
        stopConsumer(): Promise<void>;
        delete(): Promise<Queue.DeleteResult>;
        bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>;
        unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
    }
    class Binding {
        initialized: Promise<Binding>;
        _source: Exchange;
        _destination: Exchange | Queue;
        _pattern: string;
        _args: any;
        constructor(destination: Exchange | Queue, source: Exchange, pattern?: string, args?: any);
        delete(): Promise<void>;
        static id(destination: Exchange | Queue, source: Exchange): string;
        static removeBindingsContaining(connectionPoint: Exchange | Queue): Promise<any>;
    }
}
