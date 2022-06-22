yarn
yarn build

docker-compose build -f docker-compose-fantom.yml --parallel -- builder l2geth l1_chain
docker-compose build -f docker-compose-fantom.yml --parallel -- deployer dtl batch_submitter relayer integration_tests
docker-compose build -f docker-compose-fantom.yml --parallel -- boba_message-relayer-fast boba_deployer fraud-detector

docker ps

wait
