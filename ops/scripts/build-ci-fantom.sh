yarn
yarn build

docker-compose -f docker-compose-fantom.yml build --parallel -- builder l2geth l1_chain
docker-compose  -f docker-compose-fantom.yml build --parallel -- deployer dtl batch_submitter relayer integration_tests
docker-compose  -f docker-compose-fantom.yml build --parallel -- boba_message-relayer-fast boba_deployer fraud-detector

docker ps

wait
