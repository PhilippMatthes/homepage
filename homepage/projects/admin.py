from django.contrib import admin

from .models import Event, Project

# Register your models here.
admin.site.register(Project)
admin.site.register(Event)
