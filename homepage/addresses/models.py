from django.db import models

class BlockchainAddress(models.Model):
    blockchain = models.TextField()
    address = models.TextField()
    tracking_url = models.TextField(null=True, blank=True)
    image = models.ImageField(upload_to='blockchains/', null=True, blank=True)

    def __str__(self):
        return f'{self.blockchain}: {self.address}'
