from django.db import models

class Project(models.Model):
    icon = models.ImageField(upload_to='projects/')
    name = models.TextField()
    description = models.TextField(blank=True, null=True)
    url = models.TextField(blank=True, null=True)

    def __str__(self):
        return f'{self.name}'
