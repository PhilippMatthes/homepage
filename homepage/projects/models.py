from django.db import models


class Project(models.Model):
    icon = models.ImageField(upload_to='projects/')
    name = models.TextField()
    description = models.TextField(blank=True, null=True)
    url = models.TextField(blank=True, null=True)

    def __str__(self):
        return f'{self.name}'
    

class Event(models.Model):
    # A custom icon that can be displayed on the timeline.
    icon = models.ImageField(upload_to='events/', null=True, blank=True)

    # If no custom icon is provided, an emoji can be used instead.
    emoji = models.TextField(null=True, blank=True)

    # An image for the event.
    image = models.ImageField(upload_to='events/', null=True, blank=True)

    title = models.TextField()
    description = models.TextField(blank=True, null=True)
    
    # The date of the event.
    date = models.DateField(editable=True)
    
    # A special HTML color for the event.
    color = models.TextField(null=True, blank=True)

    # The second color for the gradient.
    color2 = models.TextField(null=True, blank=True)

    # The glow color in rgba() format.
    glow_color_rgba = models.TextField(null=True, blank=True)

    def __str__(self):
        return f'{self.title} ({self.date})'
