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
    interface ReconnectStrategy {
        retries: number;
        interval: number;
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
        constructor(url?: string, socketOptions?: any, reconnectStrategy?: ReconnectStrategy);
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
        declareExchange(name: string, type?: string, options?: Amqp.Options.AssertExchange): Exchange;
        declareQueue(name: string, options?: Amqp.Options.AssertQueue): Queue;
    }
    class Exchange {
        initialized: Promise<Exchange>;
        _connection: Connection;
        _channel: Amqp.Channel;
        _name: string;
        _type: string;
        _options: Amqp.Options.AssertExchange;
        constructor(connection: Connection, name: string, type?: string, options?: Amqp.Options.AssertExchange);
        publish(content: any, routingKey?: string, options?: any): void;
        delete(): Promise<void>;
        bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>;
        unbind(source: Exchange, pattern: string, args?: any): Promise<void>;
        consumerQueueName(): string;
        startConsumer(onMessage: (msg: any) => void, options?: Amqp.Options.Consume): Promise<any>;
        stopConsumer(): Promise<any>;
    }
    class Queue {
        initialized: Promise<Queue>;
        _connection: Connection;
        _channel: Amqp.Channel;
        _name: string;
        _options: Amqp.Options.AssertQueue;
        _consumer: (msg: any) => void;
        _consumerOptions: Amqp.Options.Consume;
        _consumerTag: string;
        _consumerInitialized: Promise<Amqp.Replies.Consume>;
        constructor(connection: Connection, name: string, options?: Amqp.Options.AssertQueue);
        publish(content: any, options?: any): void;
        startConsumer(onMessage: (msg: any) => void, options?: Amqp.Options.Consume): Promise<Amqp.Replies.Consume>;
        stopConsumer(): Promise<void>;
        /**
         * must acknowledge message receipt
         */
        delete(): Promise<Amqp.Replies.DeleteQueue>;
        bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>;
        unbind(source: Exchange, pattern: string, args?: any): Promise<void>;
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
    }
}
