#!/bin/bash
set -e
container_id=`docker ps -q --filter ancestor=rabbit`
docker exec $container_id rabbitmqctl stop_app
docker exec $container_id rabbitmqctl start_app
