test:
	@node node_modules/lab/bin/lab -a code -v
test-cov: 
	@node node_modules/lab/bin/lab -a code -v -t 100
test-cov-html:
	@node node_modules/lab/bin/lab -a code -v -r html -o coverage.html

.PHONY: test test-cov test-cov-html