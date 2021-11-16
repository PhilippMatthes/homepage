from django.db import models

class Weblink(models.Model):
    url = models.TextField()
    title = models.TextField()
    fontawesome_icon_css = models.TextField()

    def __str__(self):
        return f'{self.url}'
