// exported Typescript type definition for AmqpSimple

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

        constructor(url?: string, socketOptions?: any, reconnectStrategy?: Connection.ReconnectStrategy);
        private rebuildConnection();
        private tryToConnect(retry, callback);
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

        constructor(connection: Connection, name: string, type?: string, options?: Exchange.DeclarationOptions);
        publish(content: any, routingKey?: string, options?: any): void;
        delete(): Promise<void>;
        bind(source: Exchange, pattern?: string, args?: any): Promise<void>;
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

        constructor(connection: Connection, name: string, options?: Queue.DeclarationOptions);
        publish(content: any, options?: any): void;
        startConsumer(onMessage: (msg: any) => void, options?: Queue.StartConsumerOptions): Promise<Queue.StartConsumerResult>;
        stopConsumer(): Promise<void>;
        delete(): Promise<Queue.DeleteResult>;
        bind(source: Exchange, pattern?: string, args?: any): Promise<void>;
        unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
    }
}
