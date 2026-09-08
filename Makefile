.PHONY: test test-docker browsers eval baseline demo

test:
	npm run test

test-docker:
	npm run test:docker

browsers:
	npm run browsers

eval:
	npm run eval

baseline:
	npm run baseline

demo:
	npm run demo

.PHONY: eval-stub
eval-stub:
	npm run eval:stub
