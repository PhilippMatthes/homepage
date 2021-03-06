compile:
	python3 homepage/manage.py compilemessages
	yarn prod

run:
	python3 homepage/manage.py runserver

migrate:
	python3 homepage/manage.py migrate
